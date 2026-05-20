"use client";

import styles from "./QuestionCard.module.css";
import React, { ReactNode, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";

const CodeEditor = lazy(() => import("./CodeEditor"));

interface TestCase {
  input: string;
  expected_output: string;
  is_hidden: boolean;
  description?: string;
}

interface TestResult {
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  description?: string | null;
  error?: string | null;
}

const LANG_ICONS: Record<string, string> = {
  python: "🐍",
  c: "🔧",
  cpp: "⚙️",
  java: "☕",
  javascript: "🟨",
};

interface QuestionCardProps {
  question: {
    id: string;
    text: string;
    options: string[];
    marks?: number;
    image_url?: string | null;
    audio_url?: string | null;
    question_type?: "mcq" | "code";
    starter_code?: string;
    test_cases?: TestCase[];
    language?: string;
  };
  questionNumber: number;
  totalQuestions: number;
  selectedAnswer: string | undefined;
  savedCode?: string;
  onSelect: (questionId: string, option: string) => void;
  onCodeSubmit?: (questionId: string, code: string, results: TestResult[], passedCount: number, totalCount: number) => void;
  isSubmitted: boolean;
  children?: ReactNode;
}

const OPTION_KEYS = ["A", "B", "C", "D"];

function LazyAudio({ src }: { src: string }) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    if (!wrapRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 }
    );
    obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={wrapRef} style={{ margin: "12px 0", padding: "10px 14px", background: "rgba(255,255,255,0.06)", borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 20 }}>🎧</span>
      <audio src={visible ? src : undefined} controls controlsList="nodownload"
        preload="none" style={{ flex: 1, height: 36 }} />
    </div>
  );
}

export default function QuestionCard({
  question,
  questionNumber,
  totalQuestions,
  selectedAnswer,
  savedCode,
  onSelect,
  onCodeSubmit,
  isSubmitted,
  children,
}: QuestionCardProps) {
  const isCode = question.question_type === "code";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className={styles.card}
      id={`question-${questionNumber}`}
    >
      {/* Question header */}
      <div className={styles.header}>
        <span className={styles.numberText}>Question {questionNumber} of {totalQuestions}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isCode && (
            <motion.span 
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              style={{
                background: "rgba(124,58,237,0.18)",
                color: "#a78bfa",
                padding: "2px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}>
              {LANG_ICONS[question.language || "python"] || "💻"} {(question.language || "python").toUpperCase()}
            </motion.span>
          )}
          {question.marks !== undefined && question.marks > 0 && (
            <span className={styles.marks}>{question.marks} mark{question.marks !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {/* Question text */}
      <AnimatePresence mode="wait">
        <motion.p
          key={question.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 10 }}
          transition={{ duration: 0.3 }}
          className={styles.text}
        >
          {question.text}
        </motion.p>
      </AnimatePresence>

      {/* Media asset (optional) */}
      <div className={(question.image_url && question.audio_url) ? styles.multiMedia : ""}>
        {question.image_url && question.image_url.startsWith("http") && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={styles.imageContainer}
          >
            <img
              src={question.image_url}
              alt="Question Diagram"
              className={styles.image}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </motion.div>
        )}
        {question.audio_url && <LazyAudio src={question.audio_url} />}
      </div>

      {/* ── CODE QUESTION: Editor ── */}
      {isCode ? (
        <div className={styles.editorContainer}>
          <Suspense fallback={<div className={styles.loader}>Initializing IDE...</div>}>
            <CodeEditor
              questionId={question.id}
              starterCode={question.starter_code || ""}
              testCases={question.test_cases || []}
              onSubmit={(code, res, pc, tc) => onCodeSubmit?.(question.id, code, res, pc, tc)}
              isSubmitted={isSubmitted}
              savedCode={savedCode}
              language={question.language}
            />
          </Suspense>
        </div>
      ) : (
        /* ── MCQ QUESTION: Options ── */
        <div className={styles.options}>
          <AnimatePresence mode="wait">
            <motion.div
              key={question.id}
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.05
                  }
                }
              }}
              className={styles.optionsGrid}
            >
              {question.options.map((option, idx) => {
                const key = OPTION_KEYS[idx];
                const isSelected = selectedAnswer === key;

                return (
                  <motion.button
                    key={`${question.id}-${key}`}
                    variants={{
                      hidden: { opacity: 0, y: 10 },
                      visible: { opacity: 1, y: 0 }
                    }}
                    whileHover={{ scale: 1.01, backgroundColor: "rgba(255,255,255,0.05)" }}
                    whileTap={{ scale: 0.98 }}
                    id={`q${questionNumber}-option-${key}`}
                    type="button"
                    disabled={isSubmitted}
                    onClick={() => !isSubmitted && onSelect(question.id, key)}
                    className={`${styles.option} ${isSelected ? styles.selected : ""}`}
                    aria-pressed={isSelected}
                  >
                    <div className={styles.radioWrapper}>
                      {isSelected ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={styles.radioSelected}>
                          <circle cx="12" cy="12" r="10" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                          <path d="M8 12.5L10.5 15L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className={styles.radioUnselected}>
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      )}
                    </div>
                    <span className={styles.optionText}>
                      {key}. {option.replace(/^[A-D]\)\s*/, "")}
                    </span>
                  </motion.button>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Action Buttons Container (Next/Previous/Flag) */}
      {children && (
        <div className={styles.actionsContainer}>
          {children}
        </div>
      )}
    </motion.div>
  );
}
