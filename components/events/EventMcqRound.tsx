"use client";

import { useState } from "react";
import styles from "../../app/events/events.module.css";

type MCQQuestion = {
  text?: string;
  question?: string;
  options: { label: string; text: string }[];
  correct: string;
  marks: number;
};

type EventMcqRoundProps = {
  round: any; // The full round object
  onComplete: (score: number, answers: any) => void;
};

export default function EventMcqRound({ round, onComplete }: EventMcqRoundProps) {
  const config = round.config_json || {};
  const questions: MCQQuestion[] = config.questions || [];
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});

  if (!questions || questions.length === 0) {
    return (
      <div className={styles.roundBody}>
        <div style={{ textAlign: "center", opacity: 0.5 }}>No questions configured for this round.</div>
        <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
          <button className={styles.nextBtn} onClick={() => onComplete(0, {})}>Skip Round</button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];

  const handleSelect = (label: string) => {
    setSelectedAnswers(prev => ({ ...prev, [currentIndex]: label }));
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(curr => curr + 1);
    } else {
      // Calculate score
      let score = 0;
      questions.forEach((q, i) => {
        if (selectedAnswers[i] === q.correct) {
          score += Number(q.marks) || 1;
        }
      });
      onComplete(score, selectedAnswers);
    }
  };

  return (
    <div className={styles.roundBody}>
      <div style={{ marginBottom: 16, fontSize: 13, fontWeight: 800, color: "var(--nexus-accent)", textTransform: "uppercase" }}>
        Question {currentIndex + 1} of {questions.length}
      </div>
      
      <div className={styles.mcqQuestionBox}>
        <div className={styles.mcqText}>{currentQ.text || currentQ.question}</div>
        
        <div className={styles.mcqOptions}>
          {currentQ.options.map(opt => {
            const isSelected = selectedAnswers[currentIndex] === opt.label;
            return (
              <div 
                key={opt.label} 
                className={`${styles.mcqOption} ${isSelected ? styles.mcqOptionSelected : ""}`}
                onClick={() => handleSelect(opt.label)}
              >
                <span className={styles.mcqOptionLabel}>{opt.label}.</span>
                <span>{opt.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.roundFooter} style={{ padding: 0, paddingTop: 24, background: "transparent", borderTop: "none" }}>
        <button 
          className={styles.nextBtn} 
          onClick={handleNext}
          disabled={!selectedAnswers[currentIndex]}
          style={{ opacity: !selectedAnswers[currentIndex] ? 0.5 : 1, cursor: !selectedAnswers[currentIndex] ? "not-allowed" : "pointer" }}
        >
          {currentIndex < questions.length - 1 ? "Next Question" : "Complete Round"}
        </button>
      </div>
    </div>
  );
}
