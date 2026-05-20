"use client";

import styles from "./WarningModal.module.css";

interface WarningModalProps {
  warningCount: number;
  message: string;
  onDismiss?: () => void;
  onReenterFullscreen?: () => void;
}

const CONFIGS = {
  1: { icon: "⚠️", title: "Warning 1 of 3", color: "warning", dismissLabel: "I Understand — Return to Exam" },
  2: { icon: "🚨", title: "Warning 2 of 3 — FINAL WARNING", color: "danger", dismissLabel: "I Understand — Return to Exam" },
  3: { icon: "🔴", title: "Exam Auto-Submitted", color: "critical", dismissLabel: null },
};

export default function WarningModal({
  warningCount,
  message,
  onDismiss,
  onReenterFullscreen,
}: WarningModalProps) {
  const level = Math.min(warningCount, 3) as 1 | 2 | 3;
  const cfg = CONFIGS[level];

  return (
    <div
      className={styles.overlay}
      role="alertdialog"
      aria-modal="true"
    >
      <div className={`${styles.modal} ${styles[cfg.color]}`}>
        <div className={styles.icon}>{cfg.icon}</div>

        {/* Warning dots */}
        <div className={styles.badge}>
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className={`${styles.dot} ${i < level ? styles.dotFilled : ""}`}
            />
          ))}
        </div>

        <h2 className={styles.title}>
          {cfg.title}
        </h2>

        <p className={styles.message}>
          DETECTED: <strong>{message.split(":").pop()?.trim() || message}</strong>
        </p>

        {level < 3 && (
          <p className={styles.rule}>
            {level >= 2
              ? "🚨 One more violation and your exam will be auto-submitted!"
              : "After 3 violations, your exam will be automatically submitted."}
          </p>
        )}

        <div className={styles.actions}>
          {cfg.dismissLabel && onDismiss && (
            <button
              onClick={() => {
                if (onReenterFullscreen) onReenterFullscreen();
                onDismiss();
              }}
              className={level <= 1 ? styles.btnPrimary : styles.btnDanger}
            >
              {cfg.dismissLabel}
            </button>
          )}
        </div>

        {level >= 3 && (
          <p className={styles.final}>
            Your answers have been saved and submitted. Please contact your facilitator.
          </p>
        )}
      </div>
    </div>
  );
}
