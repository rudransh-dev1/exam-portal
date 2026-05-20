/**
 * lib/sync.ts — IndexedDB-backed exam sync engine
 *
 * Answers + telemetry events are queued locally in IndexedDB and
 * flushed to /py-api/sync every 30 seconds (+ random 0-5s jitter
 * to prevent thundering herd from 400 simultaneous students).
 *
 * Questions / exam config are NEVER stored here — always fetched
 * fresh from the server on every page load.
 */

import { openDB, IDBPDatabase } from "idb";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnswerRecord {
  question_id: string;
  answer_json: unknown;
  updated_at: string;
  is_final: boolean;
}

interface EventRecord {
  event_id: string;
  type: string;
  payload_json: unknown;
  ts: number;
}

interface SyncDirective {
  action: "none" | "lock" | "reload";
  message?: string;
  exam_version?: string;
  throttle?: { enabled: boolean; interval_seconds: number };
}

// ─── Callbacks for UI reactions ───────────────────────────────────────────────
type OnLockCallback = (message: string) => void;
type OnVersionChangeCallback = () => void;

let _onLock: OnLockCallback | null = null;
let _onVersionChange: OnVersionChangeCallback | null = null;
let _currentExamVersion: string | null = null;

export function registerSyncCallbacks(opts: {
  onLock?: OnLockCallback;
  onVersionChange?: OnVersionChangeCallback;
  currentExamVersion?: string;
}) {
  _onLock = opts.onLock ?? null;
  _onVersionChange = opts.onVersionChange ?? null;
  _currentExamVersion = opts.currentExamVersion ?? null;
}

// ─── IndexedDB setup ─────────────────────────────────────────────────────────

const DB_NAME = "exam-sync-v1";
let _db: IDBPDatabase | null = null;

async function getDB() {
  if (_db) return _db;
  _db = await openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("answers")) {
        db.createObjectStore("answers", { keyPath: "question_id" });
      }
      if (!db.objectStoreNames.contains("events")) {
        db.createObjectStore("events", { keyPath: "event_id" });
      }
    },
  });
  return _db;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Save a student answer locally. Will be flushed on next sync. */
export async function saveAnswer(
  questionId: string,
  answer: unknown,
  isFinal = false
) {
  const db = await getDB();
  await db.put("answers", {
    question_id: questionId,
    answer_json: answer,
    updated_at: new Date().toISOString(),
    is_final: isFinal,
  } satisfies AnswerRecord);
  scheduleFlush();
}

/** Load all saved answers (used on page refresh to restore progress). */
export async function loadSavedAnswers(): Promise<Record<string, unknown>> {
  const db = await getDB();
  const all: AnswerRecord[] = await db.getAll("answers");
  const map: Record<string, unknown> = {};
  for (const r of all) {
    map[r.question_id] = r.answer_json;
  }
  return map;
}

/** Log a telemetry event. Will be flushed on next sync. */
export async function logEvent(type: string, payload: unknown = {}) {
  const db = await getDB();
  await db.put("events", {
    event_id: crypto.randomUUID(),
    type,
    payload_json: payload,
    ts: Date.now(),
  } satisfies EventRecord);
}

/** Wipe all locally stored answers after final submit. */
export async function clearLocalSession() {
  const db = await getDB();
  await db.clear("answers");
  await db.clear("events");
  _currentExamVersion = null;
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
}

// ─── Flush logic ─────────────────────────────────────────────────────────────

const BASE_INTERVAL_MS = 30_000;
const JITTER_MS = 5_000; // spread 400 students over 35s window
const OFFLINE_RETRY_MS = 10_000;

let _sessionId: string | null = null;
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
let _lastFlush = 0;
let _flushInterval = BASE_INTERVAL_MS;

/** Call once after exam page loads with the active session ID. */
export function startSync(sessionId: string) {
  _sessionId = sessionId;
  scheduleFlush();
}

/** Call on page unload to fire a final beacon-based flush. */
export function setupBeaconFlush() {
  window.addEventListener("pagehide", async () => {
    if (!_sessionId) return;
    const db = await getDB();
    const answers: AnswerRecord[] = await db.getAll("answers");
    const events: EventRecord[] = await db.getAll("events");
    if (answers.length === 0 && events.length === 0) return;

    const blob = new Blob(
      [
        JSON.stringify({
          session_id: _sessionId,
          client_ts: new Date().toISOString(),
          responses: answers,
          events,
        }),
      ],
      { type: "application/json" }
    );
    navigator.sendBeacon("/py-api/sync", blob);
  });
}

function scheduleFlush() {
  if (_flushTimer) clearTimeout(_flushTimer);
  const sinceLast = Date.now() - _lastFlush;
  const jitter = Math.random() * JITTER_MS;
  const wait = Math.max(0, _flushInterval - sinceLast) + jitter;
  _flushTimer = setTimeout(flush, wait);
}

async function flush() {
  if (!_sessionId) return;

  const token = sessionStorage.getItem("exam_token");
  if (!token) return;

  const db = await getDB();
  const answers: AnswerRecord[] = await db.getAll("answers");
  const events: EventRecord[] = await db.getAll("events");

  try {
    const res = await fetch("/py-api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        session_id: _sessionId,
        client_ts: new Date().toISOString(),
        responses: answers,
        events,
      }),
    });

    if (!res.ok) throw new Error(`sync HTTP ${res.status}`);

    const data: SyncDirective & {
      upserted_responses?: number;
      inserted_events?: number;
    } = await res.json();

    // ── React to server directives ──
    if (data.action === "lock") {
      _onLock?.(data.message ?? "Session locked by administrator.");
      return; // Don't reschedule
    }

    if (data.action === "reload") {
      window.location.reload();
      return;
    }

    // ── Exam version staleness check ──
    if (
      data.exam_version &&
      _currentExamVersion &&
      data.exam_version !== _currentExamVersion
    ) {
      _onVersionChange?.();
    }

    // ── Clear flushed events (answers stay for restore on refresh) ──
    const tx = db.transaction("events", "readwrite");
    for (const e of events) await tx.store.delete(e.event_id);
    await tx.done;

    // ── Adjust interval based on server throttle ──
    if (data.throttle?.enabled) {
      _flushInterval = (data.throttle.interval_seconds ?? 60) * 1000;
    } else {
      _flushInterval = BASE_INTERVAL_MS;
    }

    _lastFlush = Date.now();
    scheduleFlush();
  } catch (err) {
    console.warn("[sync] flush failed, retrying in 10s", err);
    setTimeout(flush, OFFLINE_RETRY_MS);
  }
}
