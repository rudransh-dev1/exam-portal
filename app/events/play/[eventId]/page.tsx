"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import styles from "../../events.module.css";

import EventMcqRound from "@/components/events/EventMcqRound";
import EventProgrammingRound from "@/components/events/EventProgrammingRound";
import EventJumbleRound from "@/components/events/EventJumbleRound";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

type EventPhase = "loading" | "start" | "playing" | "complete";

type RoundResult = {
  roundId: string;
  roundType: string;
  score: number;
  answers: any;
};

export default function EventPlayPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const { push } = useRouter();

  const [phase, setPhase] = useState<EventPhase>("loading");
  const [eventData, setEventData] = useState<any>(null);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetch event data
  useEffect(() => {
    async function loadEvent() {
      try {
        const res = await fetch(`${API_BASE}/py-api/events/active?t=${Date.now()}`);
        if (!res.ok) throw new Error("Failed to fetch events");
        const events = await res.json();
        const found = events.find((e: any) => e.id === eventId);
        if (!found) {
          setError("Event not found or no longer active.");
          setPhase("start");
          return;
        }
        // Parse config_json if it's a string
        if (found.rounds) {
          found.rounds = found.rounds.map((r: any) => {
            if (typeof r.config_json === "string") {
              try { r.config_json = JSON.parse(r.config_json); } catch { r.config_json = {}; }
            }
            return r;
          });
          // Sort by round_number
          found.rounds.sort((a: any, b: any) => a.round_number - b.round_number);
        }
        setEventData(found);
        setPhase("start");
      } catch (e: any) {
        setError(e.message);
        setPhase("start");
      }
    }
    loadEvent();
  }, [eventId]);

  // Get student info from sessionStorage
  const getStudentInfo = () => {
    if (typeof window === "undefined") return { id: "", name: "", usn: "" };
    try {
      const raw = sessionStorage.getItem("student");
      if (raw) {
        const s = JSON.parse(raw);
        return { id: s.id || s.student_id || "", name: s.name || "", usn: s.usn || "" };
      }
    } catch {}
    return { id: "", name: "", usn: "" };
  };

  const handleStart = () => {
    if (!eventData || !eventData.rounds || eventData.rounds.length === 0) return;
    setCurrentRoundIndex(0);
    setRoundResults([]);
    setPhase("playing");
  };

  const handleRoundComplete = (score: number, answers: any) => {
    const round = eventData.rounds[currentRoundIndex];
    const result: RoundResult = {
      roundId: round.id,
      roundType: round.round_type,
      score,
      answers,
    };
    const updatedResults = [...roundResults, result];
    setRoundResults(updatedResults);

    if (currentRoundIndex < eventData.rounds.length - 1) {
      setCurrentRoundIndex(prev => prev + 1);
    } else {
      // All rounds done — submit
      submitEvent(updatedResults);
    }
  };

  const submitEvent = async (results: RoundResult[]) => {
    setPhase("complete");
    const student = getStudentInfo();
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    const totalMarks = results.length * 100; // Each round scored out of 100

    try {
      await fetch(`${API_BASE}/py-api/events/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          student_id: student.id,
          student_name: student.name,
          student_usn: student.usn,
          score: totalScore,
          total_marks: totalMarks,
          rounds_data: Object.fromEntries(results.map(r => [r.roundId, { type: r.roundType, score: r.score, answers: r.answers }])),
        }),
      });
    } catch (e) {
      console.error("[EVENT] Submit failed:", e);
    }
  };

  const handleExit = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    push("/dashboard");
  };

  // ── Render Phases ──

  if (phase === "loading") {
    return (
      <div className={styles.page}>
        <div className={styles.mainContent}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Loading Event...</div>
        </div>
      </div>
    );
  }

  if (error && !eventData) {
    return (
      <div className={styles.page}>
        <div className={styles.mainContent}>
          <div className={styles.startCard}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 className={styles.startTitle}>{error}</h2>
            <button className={styles.exitBtn} onClick={handleExit} style={{ marginTop: 24 }}>
              ← Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "start" && eventData) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.headerTitle}>Event Quest</h1>
            <div className={styles.headerSubtitle}>By {eventData.created_by_name || "Faculty"}</div>
          </div>
          <button className={styles.exitBtn} onClick={handleExit}>✕ Exit</button>
        </header>
        <div className={styles.mainContent}>
          <motion.div
            className={styles.startCard}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <div style={{ fontSize: 56, marginBottom: 16 }}>🏆</div>
            <h2 className={styles.startTitle}>{eventData.name}</h2>
            <p className={styles.startDesc}>
              {eventData.description || "Complete all rounds to earn your score. Good luck!"}
            </p>

            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 32 }}>
              {eventData.rounds?.map((r: any) => (
                <span key={r.id} style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#e4e4e7",
                }}>
                  Round {r.round_number}: {r.round_type === "mcq" ? "📝 MCQ" : r.round_type === "programming" ? "💻 Code" : "🔀 Jumble"}
                </span>
              ))}
            </div>

            <button
              className={styles.startBtn}
              onClick={handleStart}
              disabled={!eventData.rounds || eventData.rounds.length === 0}
            >
              🚀 Start Event Quest
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  if (phase === "complete") {
    const totalScore = roundResults.reduce((s, r) => s + r.score, 0);
    const totalMarks = roundResults.length * 100;
    return (
      <div className={styles.page}>
        <div className={styles.mainContent}>
          <motion.div
            className={styles.completionCard}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div style={{ fontSize: 64, marginBottom: 8 }}>🎉</div>
            <h2 className={styles.startTitle}>Quest Complete!</h2>
            <div className={styles.finalScore}>{totalScore} / {totalMarks}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32, textAlign: "left" }}>
              {roundResults.map((r, i) => (
                <div key={r.roundId} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10,
                  padding: "12px 16px",
                }}>
                  <span style={{ fontSize: 14, color: "#D8EAF2" }}>
                    Round {i + 1}: {r.roundType === "mcq" ? "MCQ" : r.roundType === "programming" ? "Programming" : "Jumble"}
                  </span>
                  <span style={{
                    fontWeight: 800,
                    fontSize: 15,
                    color: r.score >= 70 ? "#28D7D6" : r.score >= 40 ? "#fbbf24" : "#f87171",
                  }}>
                    {r.score}/100
                  </span>
                </div>
              ))}
            </div>

            <button className={styles.startBtn} onClick={handleExit}>
              Return to Dashboard
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Playing Phase ──
  if (phase === "playing" && eventData) {
    const round = eventData.rounds[currentRoundIndex];
    const roundTypeLabel = round.round_type === "mcq" ? "Multiple Choice" : round.round_type === "programming" ? "Programming" : "Code Jumble";

    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.headerTitle}>{eventData.name}</h1>
            <div className={styles.headerSubtitle}>
              Round {currentRoundIndex + 1} of {eventData.rounds.length} — {round.title}
            </div>
          </div>
          <button className={styles.exitBtn} onClick={() => {
            if (confirm("Are you sure you want to exit? Your progress will be lost.")) {
              handleExit();
            }
          }}>✕ Exit</button>
        </header>

        <div className={styles.mainContent}>
          <AnimatePresence mode="wait">
            <motion.div
              key={round.id}
              className={styles.roundContainer}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ duration: 0.3 }}
            >
              <div className={styles.roundHeader}>
                <h2 className={styles.roundTitle}>
                  Round {currentRoundIndex + 1}: {round.title}
                </h2>
                <span className={styles.roundTypeBadge}>
                  {round.round_type === "mcq" ? "📝" : round.round_type === "programming" ? "💻" : "🔀"} {roundTypeLabel}
                </span>
              </div>

              {round.round_type === "mcq" && (
                <EventMcqRound round={round} onComplete={handleRoundComplete} />
              )}
              {round.round_type === "programming" && (
                <EventProgrammingRound round={round} onComplete={handleRoundComplete} />
              )}
              {round.round_type === "jumble" && (
                <EventJumbleRound round={round} onComplete={handleRoundComplete} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return null;
}
