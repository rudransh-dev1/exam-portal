"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { fetchQuestions, submitExam, fetchPublicExamConfig, submitCodeAnswer, type Question, type SubmitResponse, type TestResult } from "@/lib/api";
import { useExamState, clearExamStorage, saveQuestionsToCache, loadQuestionsFromCache } from "@/hooks/useExamState";
import { useExamSync } from "@/hooks/useExamSync";
import SyncStatusBar from "@/components/SyncStatusBar";
import { useFullscreen } from "@/hooks/useFullscreen";
import ExamTimer from "@/components/ExamTimer";
import QuestionCard from "@/components/QuestionCard";
import nextDynamic from "next/dynamic";
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";
import ThreeDCard from "@/components/ui/ThreeDCard";

const AntiCheat = nextDynamic(() => import("@/components/AntiCheat"), { 
  ssr: false,
  loading: () => <div style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 999999, display: 'grid', placeItems: 'center', color: '#fff'}}>Loading Security Suite...</div>
});
import Skeleton from "@/components/Skeleton";
import Background from "@/components/dashboard/Background";
import styles from "./exam.module.css";

interface StudentInfo {
  id: string;
  name: string;
  branch?: string;
  examTitle?: string;
  examStartTime: string | null;
  examDurationMinutes: number;
}

const FINAL_THEMES = ["glass-aura", "glass-galaxy", "glass-ocean"];

export default function ExamPage() {
  const { push, replace } = useRouter();
  const { enter: enterFullscreen, active: isFullscreen } = useFullscreen();

  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResponse | null>(null);
  const [showResultDetails, setShowResultDetails] = useState(true);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [examInactive, setExamInactive] = useState(false);
  const [examScheduled, setExamScheduled] = useState<string | null>(null);
  const [examTitle, setExamTitle] = useState("");
  const [saveIndicator, setSaveIndicator] = useState<"idle" | "saving" | "saved">("idle");
  const [loadSource, setLoadSource] = useState<"network" | "cache" | null>(null);
  const [warningCount, setWarningCount] = useState(0);
  const [examDurationMinutes, setExamDurationMinutes] = useState(20);
  const [marksPerQuestion, setMarksPerQuestion] = useState(4);

  // Pagination state
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [showSecureGate, setShowSecureGate] = useState(true);

  // Result Timer (10 seconds for auto-redirect)
  const [resultTimerSeconds, setResultTimerSeconds] = useState(10);

  // Randomized final theme for this student's session
  const [finalTheme, setFinalTheme] = useState("glass-aura");

  const { answers, dirtyIds, selectAnswer, clearDirty, getAnsweredCount } = useExamState();
  const [codeAnswers, setCodeAnswers] = useState<Record<string, { code: string; passedCount: number; totalCount: number }>>({});

  const saveIndicatorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [examToken, setExamToken] = useState<string>("");
  const [examSessionId, setExamSessionId] = useState<string>("");

  const {
    syncStatus,
    lastSyncedAt,
    offlineMsg,
    examConfig,
    studentStatus,
    saveAnswer,
    recordEvent,
    queueCodeSubmission,
    flush,
  } = useExamSync({
    sessionId: examSessionId || "init",
    token: examToken,
    examTitle: examTitle,
    enabled: !isSubmitted && !!examSessionId,
  });

  const handleCodeSubmit = useCallback(async (
    questionId: string,
    code: string,
    results: TestResult[],
    passedCount: number,
    totalCount: number
  ) => {
    setCodeAnswers(prev => ({ ...prev, [questionId]: { code, passedCount, totalCount } }));
    // Resolve language from the question data (defaults to python)
    const lang = questions.find(q => q.id === questionId)?.language || "python";
    // Batch the submission via the sync hook
    queueCodeSubmission(questionId, code, results, passedCount, totalCount, false, lang);
  }, [queueCodeSubmission, questions]);

  // Load student + questions
  useEffect(() => {
    const isPreview = sessionStorage.getItem("exam_preview") === "true";
    const raw = sessionStorage.getItem("exam_student");
    const token = sessionStorage.getItem("exam_token");

    if (!isPreview && (!raw || !token)) {
      replace("/login");
      return;
    }

    if (!isPreview) {
      const studentInfo = raw ? JSON.parse(raw) : null;
      const studentId = studentInfo?.id;
      if (studentId) {
        import("@/lib/supabase").then(({ supabase }) => {
          const examTitleCheck = sessionStorage.getItem("exam_selected_title") || "";
          supabase.from("exam_results")
            .select("id")
            .eq("student_id", studentId)
            .eq("exam_title", examTitleCheck)
            .limit(1)
            .then(({ data }: { data: any }) => {
              if (data && data.length > 0) {
                replace("/dashboard?tab=History");
              }
            });
        });
      }
    }

    setExamToken(token || "");
    setExamSessionId(sessionStorage.getItem("exam_session_id") || "");

    const info = raw ? JSON.parse(raw) : { 
      id: "PREVIEW", 
      name: "Admin Preview", 
      examStartTime: null, 
      examDurationMinutes: 20,
      examTitle: "Online Assessment"
    };
    
    info.examDurationMinutes = info.examDurationMinutes || 20;
    if (!info.examStartTime) {
      const storedStart = sessionStorage.getItem("exam_start_time");
      if (storedStart) {
        info.examStartTime = storedStart;
      } else {
        const nowIso = new Date().toISOString();
        sessionStorage.setItem("exam_start_time", nowIso);
        info.examStartTime = nowIso;
      }
    }
    
    setStudent(info);

    if (info.id && info.id !== "PREVIEW") {
      const currentExam = sessionStorage.getItem("exam_selected_title") || info.examTitle || "Online Assessment";
      import("@/lib/supabase").then(({ supabase }) => {
        supabase.from("exam_status")
          .select("warnings")
          .eq("student_id", info.id)
          .maybeSingle()
          .then(({ data }: { data: any }) => {
            if (data) setWarningCount(data.warnings || 0);
            else setWarningCount(0);
          });
      });
    }

    const quizTitle = sessionStorage.getItem("exam_selected_title") || info.examTitle || "Online Assessment";
    setExamTitle(quizTitle);
    
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    setFinalTheme(FINAL_THEMES[Math.floor(Math.random() * FINAL_THEMES.length)]);

    const cacheKey = `exam_qs_${quizTitle}`;
    const cachedRaw = sessionStorage.getItem(cacheKey);
    if (cachedRaw) {
      try {
        const cachedQs = JSON.parse(cachedRaw);
        if (Array.isArray(cachedQs) && cachedQs.length > 0) {
          setQuestions(cachedQs);
          setLoadSource("cache");
          setLoading(false);
          return () => window.removeEventListener("popstate", handlePopState);
        }
      } catch { }
    }

    const jitterMs = Math.floor(Math.random() * 4000);
    const timeoutId = setTimeout(() => {
      fetchQuestions(quizTitle, Date.now())
        .then(async (qs: any) => {
          const qsArr = Array.isArray(qs) ? qs : (qs.questions || []);
          if (qsArr.length === 0) {
            setError(`No questions found for exam "${quizTitle}".`);
            setLoading(false);
            return;
          }
          try { sessionStorage.setItem(cacheKey, JSON.stringify(qsArr)); } catch { }
          setQuestions(qsArr);
          setLoadSource("network");
          setLoading(false);
        })
        .catch(() => {
          setError("Failed to load exam questions.");
          setLoading(false);
        });
    }, jitterMs);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [replace, enterFullscreen]);

  useEffect(() => {
    if (!examConfig) return () => {};
    let timerId: NodeJS.Timeout | undefined;
    if (examConfig.is_active === false) {
      setError("Exam deactivated by admin.");
      timerId = setTimeout(() => push("/dashboard"), 3000);
    }
    if (examConfig.duration_minutes && examConfig.duration_minutes !== examDurationMinutes) {
      setExamDurationMinutes(examConfig.duration_minutes);
    }
    if (examConfig.marks_per_question && examConfig.marks_per_question !== marksPerQuestion) {
      setMarksPerQuestion(examConfig.marks_per_question);
    }
    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [examConfig, examDurationMinutes, marksPerQuestion, push]);

  useEffect(() => {
    if (!studentStatus) return;
    if (studentStatus.status === "TERMINATED") replace("/dashboard");
    if (typeof studentStatus.warnings === "number" && studentStatus.warnings > warningCount) {
      setWarningCount(studentStatus.warnings);
    }
  }, [studentStatus, warningCount, replace]);

  const handleSelect = useCallback(
    (qId: string, option: string) => {
      selectAnswer(qId, option);
      setSaveIndicator("saving");
      saveAnswer(qId, { selected_option: option }).catch(() => {});
      clearTimeout(saveIndicatorTimer.current);
      saveIndicatorTimer.current = setTimeout(() => {
        setSaveIndicator("saved");
        setTimeout(() => setSaveIndicator("idle"), 2000);
      }, 500);
    },
    [selectAnswer, saveAnswer]
  );

  const toggleFlag = () => {
    const newFlags = new Set(flagged);
    if (newFlags.has(activeQuestionIndex)) newFlags.delete(activeQuestionIndex);
    else newFlags.add(activeQuestionIndex);
    setFlagged(newFlags);
  };

  const handleSubmit = useCallback(
    async (auto = false) => {
      if (isSubmitted || submitting) return;
      setSubmitting(true);
      setConfirmSubmit(false);
      setError("");

      try {
        await flush();
        const res = await submitExam(answers, examTitle);
        setSubmitResult(res);
        setIsSubmitted(true);
        setSubmitting(false);
        try { await flush(); } catch {}
        clearExamStorage();
        sessionStorage.removeItem("exam_start_time");
        sessionStorage.removeItem("exam_selected_title");
      } catch (err: any) {
        setError(auto ? `Auto-submit error: ${err.message}` : err.message);
        setSubmitting(false);
      }
    },
    [isSubmitted, submitting, flush, answers, examTitle]
  );

  const handleAutoSubmit = useCallback(() => handleSubmit(true), [handleSubmit]);

  useEffect(() => {
    if (!isSubmitted) return;
    const interval = setInterval(() => {
      setResultTimerSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          replace("/dashboard?tab=History");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isSubmitted, replace]);

  const answeredCount = getAnsweredCount(questions.length);
  const progressPercentage = questions.length > 0 ? (activeQuestionIndex + 1) / questions.length : 0;

  const activeTheme = useMemo(() => {
    if (progressPercentage < 0.2) return "phase-1";
    if (progressPercentage < 0.4) return "ocean";
    if (progressPercentage < 0.6) return "galaxy";
    if (progressPercentage < 0.8) return "nebula";
    return finalTheme;
  }, [progressPercentage, finalTheme]);

  const activeQuestion = questions[activeQuestionIndex];

  const withAntiCheat = (content: React.ReactNode) => (
    <div className={`${styles.wrapper} no-select`} data-theme={activeTheme} style={{ paddingBottom: "120px" }}>
      <Background />
      <AntiCheat 
        sessionId={examSessionId || "init"}
        authToken={examToken}
        studentId={student?.id || "ID_PENDING"}
        studentName={student?.name || "STUDENT_NAME"}
        isSubmitted={isSubmitted} 
        onAutoSubmit={() => handleSubmit(true)}
        onViolation={(type, meta) => {
          recordEvent(type as any);
          if (meta && typeof (meta as any).strike === 'number') {
            setWarningCount((meta as any).strike);
          }
        }}
        initialWarningCount={warningCount}
      >
        {content}
      </AntiCheat>
    </div>
  );

  if (loading || showSecureGate) {
    return (
      <div className={styles.wrapper}>
        <Background />
        <AnimatePresence>
          {showSecureGate ? (
            <m.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className={styles.secureGate}
            >
              <ThreeDCard className={styles.gateCard}>
                <m.div 
                  initial={{ rotate: -10, scale: 0.5 }}
                  animate={{ rotate: 0, scale: 1 }}
                  className={styles.gateIcon}
                >
                  🛡️
                </m.div>
                <h2 className={styles.gateTitle}>Final Security Check</h2>
                <p className={styles.gateText}>
                  You are about to enter a secure assessment environment.
                  Fullscreen mode will be enforced throughout the session.
                </p>
                <div className={styles.gateRules}>
                  <div className={styles.rule}>• Tab switching or window focus loss is disabled</div>
                  <div className={styles.rule}>• Escape key presses immediately trigger a strike</div>
                  <div className={styles.rule}>• Exit from fullscreen logs a violation</div>
                  <div className={styles.rule}>• Back button usage is strictly prohibited</div>
                </div>
                <m.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={styles.gateBtn}
                  onClick={() => {
                    enterFullscreen();
                    setShowSecureGate(false);
                  }}
                >
                  I AGREE, START EXAM →
                </m.button>
              </ThreeDCard>
            </m.div>
          ) : (
            <div style={{ padding: 28 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1200, margin: "0 auto", width: "100%" }}>
                <Skeleton height={80} borderRadius={20} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 20 }}>
                  <Skeleton height={400} borderRadius={28} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <Skeleton height={200} borderRadius={20} />
                    <Skeleton height={150} borderRadius={20} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (error && !isSubmitted) {
    return withAntiCheat(
      <div className="page-center">
        <m.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={styles.errorBox}
        >
          <p className="text-danger">{error}</p>
          <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '8px', color: 'var(--text-secondary)' }}>
            Exam Node: {examTitle} | Branch: {student?.branch || "Syncing..."}
          </div>
          <button 
            className="btn btn-primary" 
            style={{ marginTop: '20px' }}
            onClick={() => window.location.reload()}
          >
            Refresh Page
          </button>
        </m.div>
      </div>
    );
  }

  if (isSubmitted && submitResult) {
    const pct = submitResult.total_marks > 0 ? Math.round((submitResult.score / submitResult.total_marks) * 100) : 0;
    const correct = submitResult.correct_count ?? 0;
    const wrong = questions.length - correct;
    const startIso = sessionStorage.getItem("exam_start_time") || new Date().toISOString();
    const timeTakenSec = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
    const mm = String(Math.floor(timeTakenSec / 60)).padStart(2, "0");
    const ss = String(timeTakenSec % 60).padStart(2, "0");
    const scoreColor = pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";

    return (
      <div className={styles.resultOverlay}>
        <m.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={styles.resultPanel}>
          <div className={styles.resultBadge}>
            ✓ EXAM SUBMITTED
          </div>

          <m.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className={styles.scoreRing}
            style={{
              background: `conic-gradient(${scoreColor} ${pct * 3.6}deg, rgba(255,255,255,0.05) 0deg)`,
              boxShadow: `0 0 32px ${scoreColor}40`,
            }}>
            <div className={styles.scoreRingInner}>
              <span className={styles.scorePercent} style={{ color: scoreColor }}>{pct}%</span>
              <span className={styles.scoreLabel}>SCORE</span>
            </div>
          </m.div>

          <h2 className={styles.resultTitle}>
            Thank You!
          </h2>
          <p className={styles.resultSubtitle}>
            Your assessment has been recorded.
          </p>

          <div className={styles.resultStatsGrid}>
            {[
              { label: "Score", value: `${submitResult.score}/${submitResult.total_marks}`, color: scoreColor },
              { label: "Correct", value: correct, color: "#10b981" },
              { label: "Wrong", value: wrong, color: wrong > 0 ? "#ef4444" : "rgba(255,255,255,0.5)" },
              { label: "Time", value: `${mm}:${ss}`, color: "#60a5fa" },
            ].map((stat) => (
              <div key={stat.label} className={styles.resultStatCard}>
                <div className={styles.resultStatValue} style={{ color: stat.color }}>{stat.value}</div>
                <div className={styles.resultStatLabel}>{stat.label}</div>
              </div>
            ))}
          </div>

          <button
            onClick={() => replace("/dashboard?tab=History")}
            className={styles.resultViewBtn}
          >
            VIEW MY RESULTS →
          </button>

          <div className={styles.resultRedirectHint}>
            Auto-redirecting in {resultTimerSeconds}s
          </div>
        </m.div>
      </div>
    );
  }

  return withAntiCheat(
    <LazyMotion features={domAnimation}>
    <>
      <div className={styles.headerBarWrap}>
        <m.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={styles.headerBar}>
          <h2 className={styles.headerBarTitle}>
            Welcome, {student?.name || "Student"}!{" "}
            {loadSource === "cache" && (
              <span className={styles.cacheTag}>⚡ Cache</span>
            )}
            <span className={styles.headerSubtext}> Deep breaths and stay focused.</span>
          </h2>
          <div className={styles.headerAvatar}>
            {(student?.name || "S").charAt(0).toUpperCase()}
          </div>
        </m.div>
      </div>

      <main className={styles.main}>
        <div className={styles.questionCol}>
          <m.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={styles.examInfoBar}
          >
            <div className={styles.examInfoTop}>
              <h1 className={styles.examInfoTitle}>{examTitle || "Online Assessment"}</h1>
              <div className={styles.secureBadge}>
                <span className={styles.secureDot} />
                SECURE
              </div>
            </div>
            <div className={styles.examInfoBottom}>
              {!isSubmitted && (
                <div className={`${styles.warningBadge} ${warningCount >= 2 ? styles.warningCritical : warningCount === 1 ? styles.warningMild : styles.warningNone}`}>
                  <span>{warningCount >= 2 ? "🔴" : warningCount === 1 ? "🟠" : "🛡️"}</span>
                  {warningCount}/3
                </div>
              )}
              {student && (
                <ExamTimer startTime={student.examStartTime || new Date().toISOString()} durationMinutes={examDurationMinutes} onExpire={handleAutoSubmit} />
              )}
            </div>
          </m.div>

          <AnimatePresence mode="wait">
            <QuestionCard
              key={activeQuestion?.id || "empty"}
              question={activeQuestion}
              questionNumber={activeQuestionIndex + 1}
              totalQuestions={questions.length}
              selectedAnswer={answers[activeQuestion?.id]}
              savedCode={codeAnswers[activeQuestion?.id]?.code}
              onSelect={handleSelect}
              onCodeSubmit={handleCodeSubmit}
              isSubmitted={isSubmitted}
            >
              <div className={styles.actionsRow}>
                <div className={styles.navBtnRow}>
                  {activeQuestionIndex > 0 && (
                    <m.button
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      className={styles.prevBtn}
                      onClick={() => setActiveQuestionIndex((prev) => Math.max(0, prev - 1))}
                    >
                      ← PREV
                    </m.button>
                  )}
                  {activeQuestionIndex < questions.length - 1 ? (
                    <m.button
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      className={styles.nextBtn}
                      onClick={() => setActiveQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                    >
                      NEXT →
                    </m.button>
                  ) : (
                    <m.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      className={styles.finishBtn}
                      onClick={() => setConfirmSubmit(true)}
                    >
                      FINISH & SUBMIT 🚀
                    </m.button>
                  )}
                </div>
                <button
                  type="button"
                  className={`${styles.flagBtn} ${flagged.has(activeQuestionIndex) ? styles.flagBtnActive : ""}`}
                  onClick={toggleFlag}
                >
                  <span>{flagged.has(activeQuestionIndex) ? "🚩" : "🏳️"}</span>
                  {flagged.has(activeQuestionIndex) ? "FLAGGED" : "MARK AS FLAG"}
                </button>
              </div>
            </QuestionCard>
          </AnimatePresence>
        </div>

        <aside className={styles.sidebar}>
          <ThreeDCard intensity={10}>
            <div className={styles.sideCard}>
              <h3 className={styles.sideTitle}>Progress</h3>
              <div className={styles.navGrid}>
                {questions.map((q, i) => {
                  const isAnswered = !!answers[q.id];
                  const isActive = i === activeQuestionIndex;
                  const isFlagged = flagged.has(i);
                  return (
                    <m.button 
                      key={q.id} 
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setActiveQuestionIndex(i)} 
                      className={`${styles.navBtn} ${isAnswered ? styles.navAnswered : ""} ${isActive ? styles.navActive : ""} ${isFlagged ? styles.navFlagged : ""}`}
                    >
                      {isAnswered ? <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg> : i + 1}
                      {isFlagged && <span className={styles.flagDot} />}
                    </m.button>
                  );
                })}
              </div>

              {questions.length > 0 && (
                <div className={styles.sidebarReviewSection}>
                  <button className={styles.reviewBtn} onClick={() => setActiveQuestionIndex(0)}>🔍 REVIEW ALL</button>
                  <m.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={styles.submitBtnSidebar}
                    onClick={() => setConfirmSubmit(true)}
                  >
                    🚀 SUBMIT EXAM
                  </m.button>
                </div>
              )}
            </div>
          </ThreeDCard>
        </aside>
      </main>

      <AnimatePresence>
        {confirmSubmit && (
          <m.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={styles.confirmOverlayFull}
          >
            <m.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.1, y: 10 }}
              className={styles.confirmContent}
            >
              <div className={styles.confirmIcon}>🚀</div>
              <h2 className={styles.confirmTitle}>Final Submission</h2>
              <p className={styles.confirmDesc}>
                You have answered <strong>{answeredCount}</strong> out of <strong>{questions.length}</strong> questions.<br/>
                Ready to submit?
              </p>
              <div className={styles.confirmBtnGroup}>
                <m.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={styles.confirmYesBtn}
                  onClick={() => handleSubmit()}
                  disabled={submitting}
                >
                  {submitting ? "Processing..." : "YES, SUBMIT MY EXAM"}
                </m.button>
                <button
                  className={styles.confirmNoBtn}
                  onClick={() => setConfirmSubmit(false)}
                  disabled={submitting}
                >
                  NO, GO BACK
                </button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
    </LazyMotion>
  );
}
