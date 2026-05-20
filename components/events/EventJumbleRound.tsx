"use client";

import { useState } from "react";
import styles from "../../app/events/events.module.css";
import { ArrowUp, ArrowDown, Loader2 } from "lucide-react";

type JumbleLine = {
  id: string;
  text: string;
};

type EventJumbleRoundProps = {
  round: any; // The full round object
  onComplete: (score: number, answers: any) => void;
};

// Basic shuffle function
function shuffleArray(array: any[]) {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

export default function EventJumbleRound({ round, onComplete }: EventJumbleRoundProps) {
  const config = round.config_json || {};
  const rawLines = config.lines || [];
  const originalLines: JumbleLine[] = rawLines.map((line: any, index: number) => {
    if (typeof line === 'string') {
      return { id: `line-${index}`, text: line };
    }
    return line;
  });
  
  // Initialize with shuffled lines
  const [lines, setLines] = useState<JumbleLine[]>(() => {
    if (originalLines.length === 0) return [];
    return shuffleArray(originalLines);
  });
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!originalLines || originalLines.length === 0) {
    return (
      <div className={styles.roundBody}>
        <div style={{ textAlign: "center", opacity: 0.5 }}>No jumble lines configured for this round.</div>
        <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
          <button className={styles.nextBtn} onClick={() => onComplete(0, {})}>Skip Round</button>
        </div>
      </div>
    );
  }

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newLines = [...lines];
    const temp = newLines[index];
    newLines[index] = newLines[index - 1];
    newLines[index - 1] = temp;
    setLines(newLines);
    setFeedback(null);
  };

  const moveDown = (index: number) => {
    if (index === lines.length - 1) return;
    const newLines = [...lines];
    const temp = newLines[index];
    newLines[index] = newLines[index + 1];
    newLines[index + 1] = temp;
    setLines(newLines);
    setFeedback(null);
  };

  const handleComplete = async () => {
    setChecking(true);
    setFeedback(null);

    // ── Step 1: Check exact match (fastest) ──
    let correctCount = 0;
    lines.forEach((line, index) => {
      if (line.id === originalLines[index].id) {
        correctCount++;
      }
    });

    if (correctCount === originalLines.length) {
      // Perfect match — instant pass
      setChecking(false);
      onComplete(100, { submitted_order: lines, method: "exact" });
      return;
    }

    // ── Step 2: If close enough (>80% lines match), accept it ──
    const matchRatio = correctCount / originalLines.length;
    if (matchRatio >= 0.8) {
      setChecking(false);
      const score = Math.round(matchRatio * 100);
      onComplete(score, { submitted_order: lines, method: "partial_exact" });
      return;
    }

    // ── Step 3: After 10 failed attempts, ask AI for semantic evaluation ──
    const newFailCount = failedAttempts + 1;
    setFailedAttempts(newFailCount);

    if (newFailCount >= 10) {
      try {
        const token = sessionStorage.getItem("exam_token");
        const assembledCode = lines.map(l => l.text).join("\n");
        const res = await fetch("/py-api/eval/ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            code: assembledCode,
            language: "python",
            eval_type: "jumble",
            question_context: config.title || config.description || "Reorder the lines of code correctly",
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setChecking(false);
          if (data.passed) {
            setFeedback(`✅ AI verified: ${data.feedback}`);
            onComplete(data.score, { submitted_order: lines, method: "ai", graded_by: data.graded_by });
            return;
          } else {
            setFeedback(`❌ AI says: ${data.feedback}. Try again!`);
            return;
          }
        }
      } catch (err) {
        console.warn("[jumble] AI eval failed:", err);
      }
    }

    // ── Step 4: Normal fail — show feedback ──
    setChecking(false);
    const score = Math.round(matchRatio * 100);
    setFeedback(`${correctCount}/${originalLines.length} lines correct (${score}%). Keep trying! ${newFailCount >= 8 ? "AI review available after " + (10 - newFailCount) + " more attempts." : ""}`);
  };

  return (
    <div className={styles.roundBody}>
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 8 }}>{config.title || "Code Jumble"}</h3>
        <p style={{ color: "rgba(216,234,242,0.7)", fontSize: 14 }}>
          {config.description || "Reorder the lines of code to form the correct sequence. Use the up and down arrows."}
        </p>
      </div>

      <div className={styles.jumbleList}>
        {lines.map((line, index) => (
          <div key={line.id} className={styles.jumbleItem}>
            <div className={styles.jumbleControls}>
              <button 
                className={styles.jumbleBtn} 
                onClick={() => moveUp(index)} 
                disabled={index === 0 || checking}
                title="Move Up"
              >
                <ArrowUp size={14} />
              </button>
              <button 
                className={styles.jumbleBtn} 
                onClick={() => moveDown(index)} 
                disabled={index === lines.length - 1 || checking}
                title="Move Down"
              >
                <ArrowDown size={14} />
              </button>
            </div>
            <div style={{ flex: 1, overflowX: "auto", whiteSpace: "pre" }}>
              {line.text}
            </div>
          </div>
        ))}
      </div>

      {feedback && (
        <div style={{
          marginTop: 16,
          padding: "12px 16px",
          borderRadius: 10,
          background: feedback.startsWith("✅") ? "rgba(40,215,214,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${feedback.startsWith("✅") ? "rgba(40,215,214,0.2)" : "rgba(239,68,68,0.2)"}`,
          color: feedback.startsWith("✅") ? "#28D7D6" : "#ef4444",
          fontSize: 13,
        }}>
          {feedback}
        </div>
      )}

      <div className={styles.roundFooter} style={{ padding: 0, paddingTop: 32, background: "transparent", borderTop: "none" }}>
        <button className={styles.nextBtn} onClick={handleComplete} disabled={checking}>
          {checking ? (
            <><Loader2 size={16} style={{ animation: "spin 1s linear infinite", marginRight: 8 }} /> Checking...</>
          ) : (
            "Verify Sequence & Complete Round"
          )}
        </button>
      </div>
    </div>
  );
}
