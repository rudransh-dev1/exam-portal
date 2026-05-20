"use client";

import { useState, useRef, useEffect } from "react";
import styles from "../../app/events/events.module.css";
import CodeEditor from "@/components/CodeEditor";

type EventProgrammingRoundProps = {
  round: any;
  onComplete: (score: number, answers: any) => void;
};

export default function EventProgrammingRound({ round, onComplete }: EventProgrammingRoundProps) {
  const config = round.config_json || {};
  const [submitted, setSubmitted] = useState(false);
  const [codeSnapshot, setCodeSnapshot] = useState("");

  const starterCode = config.starterCode || config.starter_code || "# Write your solution here\n";
  const language = config.language || "python";
  const testCases = (config.testCases || config.test_cases || []).map((tc: any, i: number) => ({
    input: tc.input || "",
    expected_output: tc.expected_output || tc.expectedOutput || "",
    is_hidden: tc.is_hidden || false,
    description: tc.description || `Test Case ${i + 1}`,
  }));

  const totalMarks = testCases.length > 0 ? 100 : 0; // score out of 100

  const handleSubmit = (code: string, results: any[], passedCount: number, totalCount: number) => {
    setSubmitted(true);
    setCodeSnapshot(code);
    const score = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
    onComplete(score, {
      code,
      results,
      passedCount,
      totalCount,
    });
  };

  if (!config.starterCode && !config.starter_code && !config.title) {
    return (
      <div className={styles.roundBody}>
        <div style={{ textAlign: "center", opacity: 0.5 }}>No programming challenge configured for this round.</div>
        <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
          <button className={styles.nextBtn} onClick={() => onComplete(0, {})}>Skip Round</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.roundBody}>
      {config.title && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 8 }}>{config.title}</h3>
          {config.description && (
            <p style={{ color: "rgba(216,234,242,0.7)", fontSize: 14, lineHeight: 1.6 }}>{config.description}</p>
          )}
        </div>
      )}

      {config.hint && (
        <div style={{
          background: "rgba(168, 85, 247, 0.08)",
          border: "1px solid rgba(168, 85, 247, 0.2)",
          borderRadius: 10,
          padding: "12px 16px",
          marginBottom: 24,
          fontSize: 13,
          color: "#c084fc",
        }}>
          💡 <strong>Hint:</strong> {config.hint}
        </div>
      )}

      {config.targetOutput && (
        <div style={{
          background: "rgba(40, 215, 214, 0.05)",
          border: "1px solid rgba(40, 215, 214, 0.15)",
          borderRadius: 10,
          padding: "12px 16px",
          marginBottom: 24,
          fontSize: 13,
          color: "#28D7D6",
        }}>
          🎯 <strong>Target Output:</strong> <code style={{ fontFamily: "'Fira Code', monospace" }}>{config.targetOutput}</code>
        </div>
      )}

      <CodeEditor
        questionId={`event-round-${round.id}`}
        starterCode={starterCode}
        testCases={testCases}
        onSubmit={handleSubmit}
        isSubmitted={submitted}
        language={language}
      />
    </div>
  );
}
