/**
 * useExamSync.ts
 * Master client-side sync engine:
 *  - Debounced dirty save (3s idle)
 *  - Batch flush every 30s (configurable via throttle_mode)
 *  - Exponential backoff on failures
 *  - Online/offline detection → IDB drain on reconnect
 *  - navigator.sendBeacon on beforeunload
 *  - Progressive degrade on 429/503
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  saveResponse, getDirtyResponses, markResponsesSynced,
  queueEvent, getPendingEvents, deleteEvents,
  saveCodeSubmission, getDirtyCodeSubmissions, markCodeSubmissionsSynced,
  setMeta, getMeta, buildBeaconPayload,
  ResponseRecord, TelemetryEvent, CodeSubmissionRecord
} from "@/lib/examIDB";

const BEACON_URL      = "/api/events_beacon";
const SYNC_ALL_URL    = "/api/exam/sync-all";
const PULSE_URL       = "/api/exam/pulse"; // New high-frequency endpoint

const DEFAULT_INTERVAL_MS   = 120_000; // Increased to 2 mins for idle
const FAST_INTERVAL_MS      = 30_000;  // 30s when dirty
const PULSE_INTERVAL_MS     = 10_000;  // 10s for heartbeat
const BACKGROUND_PULSE_MS   = 60_000;  // 60s when tab is hidden
const IDLE_DEBOUNCE_MS      = 10_000;  // 10s idle debounce (faster save)
const MAX_BACKOFF_MS        = 120_000;

export interface ExamConfig {
  duration_minutes: number;
  exam_title: string;
  is_active: boolean;
  max_attempts?: number;
  [key: string]: any;
}

export interface StudentStatus {
  status: string;
  warnings: number;
  is_banned: boolean;
  [key: string]: any;
}

type SyncStatus = "idle" | "syncing" | "offline" | "degraded" | "error";

export interface UseExamSyncOptions {
  sessionId: string;
  token:     string;
  examTitle?: string;
  enabled?:  boolean;
}

export function useExamSync({ sessionId, token, examTitle, enabled = true }: UseExamSyncOptions) {
  const [syncStatus, setSyncStatus]     = useState<SyncStatus>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [offlineMsg, setOfflineMsg]     = useState<string | null>(null);
  const [examConfig, setExamConfig]     = useState<ExamConfig | null>(null);
  const [studentStatus, setStudentStatus] = useState<StudentStatus | null>(null);

  const intervalMsRef   = useRef(DEFAULT_INTERVAL_MS);
  const backoffMsRef    = useRef(0);
  const failCountRef    = useRef(0);
  const debounceTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushTimer      = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseTimer      = useRef<ReturnType<typeof setInterval> | null>(null);
  const isOnlineRef     = useRef(typeof navigator !== "undefined" ? navigator.onLine : true);
  const isVisibleRef    = useRef(true);
  const lastPulseAtRef  = useRef(0);

  const authHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };

  // ── Core flush function (Unified Sync) ──────────────────────────────────────

  const flush = useCallback(async (isPriority = false) => {
    if (!sessionId || !enabled) return;
    if (!isOnlineRef.current) return;

    setSyncStatus("syncing");

    try {
      const responses = await getDirtyResponses(sessionId, 50);
      const events    = await getPendingEvents(sessionId, 50);
      const codeSubmissions = await getDirtyCodeSubmissions(sessionId, 10);

      const hasDirtyData = responses.length > 0 || events.length > 0 || codeSubmissions.length > 0;

      // If no dirty data and not priority, skip full sync if heartbeat (pulse) was recent
      if (!hasDirtyData && !isPriority && (Date.now() - lastPulseAtRef.current < DEFAULT_INTERVAL_MS)) {
        setSyncStatus("idle");
        return;
      }

      const res = await fetch(SYNC_ALL_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          session_id: sessionId,
          exam_title: examTitle,
          responses:  responses.map((r) => ({
            question_id: r.questionId,
            answer_json: r.answerJson,
            updated_at:  r.updatedAt,
            is_final:    r.isFinal,
          })),
          events: events.map((e) => ({
            event_id:    e.eventId,
            type:        e.type,
            payload_json: e.payloadJson,
            ts:          e.ts,
          })),
          code_submissions: codeSubmissions.map((cs) => ({
            question_id: cs.questionId,
            code:        cs.code,
            language:    cs.language,
            test_results: cs.testResults,
            passed_count: cs.passedCount,
            total_count:  cs.totalCount,
            is_final:     cs.isFinal,
            submitted_at: cs.submittedAt,
          })),
          client_ts: Date.now(),
        }),
      });

      if (!res.ok) {
        if (res.status === 429 || res.status === 503) {
          _onServerBusy(res.status);
        } else {
          _onFlushFailed();
        }
        return;
      }

      const data = await res.json();
      
      // Update config and status
      if (data.config) {
        setExamConfig(data.config);
        if (data.config.autosave_interval_ms && data.config.autosave_interval_ms !== intervalMsRef.current) {
          intervalMsRef.current = data.config.autosave_interval_ms;
          _restartFlushTimer();
        }
      }
      if (data.status) setStudentStatus(data.status);

      // Mark synced
      if (responses.length) await markResponsesSynced(sessionId, responses.map((r) => r.questionId));
      if (events.length) await deleteEvents(events.map((e) => e.eventId));
      if (codeSubmissions.length) await markCodeSubmissionsSynced(sessionId, codeSubmissions.map((cs) => cs.questionId));

      failCountRef.current = 0;
      backoffMsRef.current = 0;
      setSyncStatus("idle");
      setLastSyncedAt(new Date());
      await setMeta("lastSyncedAt", new Date().toISOString());
      setOfflineMsg(null);

      // If we still have dirty data, speed up next sync
      const remaining = await getDirtyResponses(sessionId, 1);
      if (remaining.length > 0) {
        intervalMsRef.current = FAST_INTERVAL_MS;
        _restartFlushTimer();
      } else {
        intervalMsRef.current = DEFAULT_INTERVAL_MS;
        _restartFlushTimer();
      }

    } catch (err) {
      console.error("[SYNC] Flush error:", err);
      _onFlushFailed();
    }
  }, [sessionId, token, examTitle, enabled]);

  // ── High-frequency Pulse (Status only) ─────────────────────────────────────

  const pulse = useCallback(async () => {
    if (!sessionId || !enabled || !isOnlineRef.current) return;

    try {
      lastPulseAtRef.current = Date.now();
      const res = await fetch(PULSE_URL, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          session_id: sessionId,
          exam_title: examTitle,
          ts: Date.now(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status) setStudentStatus(data.status);
        if (data.terminate) {
          // Hard termination check
          window.location.href = "/dashboard?terminated=true";
        }
      }
    } catch (err) {
      // Pulse fails silently to avoid annoying user
      console.warn("[SYNC] Pulse failed");
    }
  }, [sessionId, authHeaders, examTitle, enabled]);

  function _onFlushFailed() {
    failCountRef.current++;
    const newBackoff = Math.min(MAX_BACKOFF_MS, (backoffMsRef.current || 5_000) * 2);
    backoffMsRef.current = newBackoff;

    if (failCountRef.current >= 3) {
      setSyncStatus("degraded");
      intervalMsRef.current = 60_000;
      setOfflineMsg("⚠️ Connection unstable — saving locally. Stay on this tab.");
      _restartFlushTimer();
    } else {
      setSyncStatus("error");
    }
  }

  function _onServerBusy(status: number) {
    const current = intervalMsRef.current;
    if (status === 503) {
      intervalMsRef.current = Math.min(MAX_BACKOFF_MS, current * 2);
    } else {
      intervalMsRef.current = Math.min(60_000, current * 1.5);
    }
    setSyncStatus("degraded");
    setOfflineMsg("⚠️ Server under load — saving locally. Do not close this tab.");
    _restartFlushTimer();
  }

  function _restartFlushTimer() {
    if (flushTimer.current) clearInterval(flushTimer.current);
    const jitter = Math.floor(Math.random() * 5000);
    flushTimer.current = setInterval(() => flush(false), intervalMsRef.current + jitter);
  }

  function _restartPulseTimer() {
    if (pulseTimer.current) clearInterval(pulseTimer.current);
    const interval = isVisibleRef.current ? PULSE_INTERVAL_MS : BACKGROUND_PULSE_MS;
    pulseTimer.current = setInterval(pulse, interval);
  }

  // ── Online/offline handlers ────────────────────────────────────────────────

  const onOnline = useCallback(async () => {
    isOnlineRef.current = true;
    setSyncStatus("idle");
    setOfflineMsg(null);
    flush(); // Trigger immediate sync on reconnect
  }, [flush]);

  const onOffline = useCallback(() => {
    isOnlineRef.current = false;
    setSyncStatus("offline");
    setOfflineMsg("📡 You are offline — answers saved locally. Reconnect to sync.");
  }, []);

  // ── beforeunload beacon ────────────────────────────────────────────────────

  const onBeforeUnload = useCallback(async () => {
    const blob = await buildBeaconPayload(sessionId);
    if (blob) navigator.sendBeacon(BEACON_URL, blob);
  }, [sessionId]);

  // ── Public: save a response (dirty) ────────────────────────────────────────

  const saveAnswer = useCallback(async (
    questionId: string,
    answerJson: Record<string, unknown>,
    isFinal = false,
  ) => {
    const record: ResponseRecord = {
      sessionId,
      questionId,
      answerJson,
      updatedAt: new Date().toISOString(),
      dirty:     true,
      isFinal,
    };
    await saveResponse(record);

    // Debounce: 15s idle → flush
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => flush(isFinal), IDLE_DEBOUNCE_MS);
    
    // If final, flush immediately
    if (isFinal) flush(true);
  }, [sessionId, flush]);

  // ── Public: record a telemetry event ──────────────────────────────────────

  const recordEvent = useCallback(async (
    type: string,
    payloadJson: Record<string, unknown> = {},
  ) => {
    const event: TelemetryEvent = {
      eventId:     crypto.randomUUID(),
      type,
      payloadJson,
      ts:          Date.now(),
      sessionId,
    };
    await queueEvent(event);
  }, [sessionId]);

  // ── Public: queue a code submission ──────────────────────────────────────

  const queueCodeSubmission = useCallback(async (
    questionId: string,
    code: string,
    testResults: any[],
    passedCount: number,
    totalCount: number,
    isFinal = false,
    language = "python",
  ) => {
    const record: CodeSubmissionRecord = {
      sessionId,
      questionId,
      code,
      language,
      testResults,
      passedCount,
      totalCount,
      isFinal,
      submittedAt: new Date().toISOString(),
      dirty: true,
    };
    await saveCodeSubmission(record);

    // Debounce: 15s idle → flush
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => flush(isFinal), IDLE_DEBOUNCE_MS);

    if (isFinal) flush(true);
  }, [sessionId, flush]);

  // ── Public: download local backup ─────────────────────────────────────────

  const downloadBackup = useCallback(async () => {
    const { getAllResponses } = await import("@/lib/examIDB");
    const all = await getAllResponses(sessionId);
    const blob = new Blob([JSON.stringify({ sessionId, responses: all, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `exam-backup-${sessionId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sessionId]);

  // ── Lifecycle ────────────────────────────────────────────────────────────

  const onVisibilityChange = useCallback(() => {
    isVisibleRef.current = document.visibilityState === "visible";
    // Sync pulse frequency immediately on visibility change
    _restartPulseTimer();
    if (isVisibleRef.current) {
      // Re-sync if coming back to tab after long time
      flush(false);
    }
  }, [flush, pulse]);

  // ── Lifecycle ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId || !enabled) return;

    // Load last synced timestamp
    getMeta<string>("lastSyncedAt").then((v) => { if (v) setLastSyncedAt(new Date(v)); });

    // Initial sync
    flush(true);

    // Start timers
    flushTimer.current = setInterval(() => flush(false), intervalMsRef.current);
    pulseTimer.current = setInterval(pulse, PULSE_INTERVAL_MS);

    window.addEventListener("online",           onOnline);
    window.addEventListener("offline",          onOffline);
    window.addEventListener("beforeunload",     onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (flushTimer.current)   clearInterval(flushTimer.current);
      if (pulseTimer.current)   clearInterval(pulseTimer.current);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      window.removeEventListener("online",           onOnline);
      window.removeEventListener("offline",          onOffline);
      window.removeEventListener("beforeunload",     onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sessionId, enabled, flush, pulse, onOnline, onOffline, onBeforeUnload, onVisibilityChange]);

  return {
    saveAnswer,
    recordEvent,
    queueCodeSubmission,
    downloadBackup,
    flush,
    syncStatus,
    lastSyncedAt,
    offlineMsg,
    examConfig,
    studentStatus,
  };
}
