"use client";

import { useState } from "react";
import styles from "../../app/events/events.module.css";
import { ArrowUp, ArrowDown } from "lucide-react";

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
    // Ensure it's actually shuffled (if random returns same order, it's fine for now, but usually it shuffles)
    return shuffleArray(originalLines);
  });

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
  };

  const moveDown = (index: number) => {
    if (index === lines.length - 1) return;
    const newLines = [...lines];
    const temp = newLines[index];
    newLines[index] = newLines[index + 1];
    newLines[index + 1] = temp;
    setLines(newLines);
  };

  const handleComplete = () => {
    // Calculate score (simple exact match per line)
    // For a more advanced score, you could use Levenshtein distance, but exact index match is standard.
    let correctCount = 0;
    lines.forEach((line, index) => {
      if (line.id === originalLines[index].id) {
        correctCount++;
      }
    });

    const score = (correctCount / originalLines.length) * 100; // 0 to 100
    onComplete(Math.round(score), { submitted_order: lines });
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
                disabled={index === 0}
                title="Move Up"
              >
                <ArrowUp size={14} />
              </button>
              <button 
                className={styles.jumbleBtn} 
                onClick={() => moveDown(index)} 
                disabled={index === lines.length - 1}
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

      <div className={styles.roundFooter} style={{ padding: 0, paddingTop: 32, background: "transparent", borderTop: "none" }}>
        <button className={styles.nextBtn} onClick={handleComplete}>
          Verify Sequence & Complete Round
        </button>
      </div>
    </div>
  );
}
