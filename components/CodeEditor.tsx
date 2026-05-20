"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import styles from "./CodeEditor.module.css";

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

interface CodeEditorProps {
  questionId: string;
  starterCode: string;
  testCases: TestCase[];
  onSubmit: (code: string, results: TestResult[], passedCount: number, totalCount: number) => void;
  isSubmitted: boolean;
  savedCode?: string;
  language?: string;
}

type EngineStatus = "loading" | "ready" | "error" | "running";

const LANG_COMMENTS: Record<string, string> = {
  python: "# Write your Python solution here\n",
  c: "// Write your C solution here\n#include <stdio.h>\n\nint main() {\n    \n    return 0;\n}\n",
  cpp: "// Write your C++ solution here\n#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n",
  java: "// Write your Java solution here\nimport java.util.Scanner;\n\npublic class Solution {\n    public static void main(String[] args) {\n        \n    }\n}\n",
};

const LANG_LABELS: Record<string, string> = {
  python: "Python",
  c: "C",
  cpp: "C++",
  java: "Java",
};

export default function CodeEditor({
  questionId,
  starterCode,
  testCases,
  onSubmit,
  isSubmitted,
  savedCode,
  language = "python",
}: CodeEditorProps) {
  // ── Language Selector State ──
  const [selectedLanguage, setSelectedLanguage] = useState(language);

  // ── Single Unified Code State (avoids wiping student's typed code) ──
  const [code, setCode] = useState(() => {
    if (savedCode) return savedCode;
    if (starterCode) return starterCode;
    return LANG_COMMENTS[language] || `# Write your solution here\n`;
  });

  const isPython = selectedLanguage === "python";
  const langLabel = LANG_LABELS[selectedLanguage] || selectedLanguage;

  const [engineStatus, setEngineStatus] = useState<EngineStatus>("ready");
  const [results, setResults] = useState<TestResult[]>([]);
  const [passedCount, setPassedCount] = useState(0);
  const [hasRun, setHasRun] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  
  const workerRef = useRef<Worker | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Refs to avoid stale closures in worker message handler
  const codeRef = useRef(code);
  const langRef = useRef(selectedLanguage);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => {
    langRef.current = selectedLanguage;
  }, [selectedLanguage]);

  // ── AI evaluator ──
  const callAIEval = useCallback(async (codeToEval: string, langToEval: string) => {
    setEngineStatus("running");
    setAiFeedback(null);
    try {
      const token = sessionStorage.getItem("exam_token");
      const res = await fetch("/py-api/eval/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          code: codeToEval,
          language: langToEval,
          eval_type: "programming",
          question_context: questionId,
          test_cases: testCases.map(tc => ({
            input: tc.input,
            expected_output: tc.expected_output,
            description: tc.description,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const aiResults: TestResult[] = [{
          input: "AI Evaluation",
          expected: "Logically correct solution",
          actual: data.passed ? "Correct" : "Incorrect",
          passed: data.passed,
          description: `🤖 ${data.feedback} (graded by ${data.graded_by})`,
        }];
        setResults(aiResults);
        setPassedCount(data.passed ? testCases.length : 0);
        setHasRun(true);
        setEngineStatus("ready");
        setAiFeedback(data.feedback);
        if (data.passed) {
          setFailedAttempts(0);
        }
      } else {
        throw new Error("AI eval request failed");
      }
    } catch (err) {
      console.warn("[CodeEditor] AI eval failed:", err);
      setEngineStatus("ready");
      setAiFeedback("AI grader temporarily unavailable. Please try again.");
    }
  }, [questionId, testCases]);

  const callAIEvalRef = useRef(callAIEval);
  useEffect(() => {
    callAIEvalRef.current = callAIEval;
  }, [callAIEval]);

  // Init Pyodide Web Worker (runs in background so it's always warm for Python)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const worker = new Worker("/pyodide-worker.js");
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type } = e.data;
      if (type === "ready") {
        if (langRef.current === "python") setEngineStatus("ready");
      } else if (type === "loading") {
        if (langRef.current === "python") setEngineStatus("loading");
      } else if (type === "error") {
        if (langRef.current === "python") setEngineStatus("error");
      } else if (type === "result") {
        const { results: res, passedCount: pc, totalCount } = e.data;
        setResults(res);
        setPassedCount(pc);
        setHasRun(true);
        setEngineStatus("ready");

        // Track consecutive failures for AI fallback
        if (pc < totalCount) {
          setFailedAttempts(prev => {
            const newCount = prev + 1;
            if (newCount >= 10) {
              setAiFeedback("🤖 Pyodide tests failed 10 times. Requesting AI review...");
              callAIEvalRef.current(codeRef.current, "python");
            }
            return newCount;
          });
        } else {
          setFailedAttempts(0);
        }
      }
    };

    worker.onerror = () => {
      if (langRef.current === "python") setEngineStatus("error");
    };

    return () => worker.terminate();
  }, []);

  const handleLanguageChange = (newLang: string) => {
    if (isSubmitted) return;

    // Smart swap: if they haven't typed custom code yet, switch starter code template.
    // Otherwise, preserve whatever custom code they wrote so it is never lost!
    const isUntouched = 
      code === "" || 
      code === LANG_COMMENTS[selectedLanguage] || 
      code === starterCode;

    if (isUntouched) {
      setCode(LANG_COMMENTS[newLang] || `// Write your ${LANG_LABELS[newLang]} solution here\n`);
    }

    setSelectedLanguage(newLang);
    setEngineStatus("ready");
    setAiFeedback(null);
  };

  const handleRun = useCallback(() => {
    if (engineStatus !== "ready" || isSubmitted) return;

    // ── Ultra-Premium Magic: Auto-detect language if they wrote C/C++/Java in Python mode ──
    let activeLang = selectedLanguage;
    if (selectedLanguage === "python") {
      const codeTrimmed = code.trim();
      if (codeTrimmed.includes("#include") || codeTrimmed.includes("printf(") || codeTrimmed.includes("scanf(")) {
        activeLang = "c";
      } else if (codeTrimmed.includes("std::") || codeTrimmed.includes("cout <<") || codeTrimmed.includes("cin >>")) {
        activeLang = "cpp";
      } else if (codeTrimmed.includes("public class ") || codeTrimmed.includes("System.out.print")) {
        activeLang = "java";
      }

      if (activeLang !== "python") {
        setSelectedLanguage(activeLang);
        setAiFeedback(`🤖 Auto-detected ${LANG_LABELS[activeLang]} code! Switched compiler language for you.`);
        callAIEval(code, activeLang);
        return;
      }
    }

    // ── Non-Python: route to AI auto-grader ──
    if (activeLang !== "python") {
      callAIEval(code, activeLang);
      return;
    }

    // ── Python: run in browser using Pyodide ──
    if (!workerRef.current) return;
    setEngineStatus("running");
    setResults([]);
    setHasRun(false);
    setAiFeedback(null);
    workerRef.current.postMessage({
      type: "exam",
      code,
      testCases,
      questionId,
      timeoutMs: 10000,
    });
  }, [code, testCases, questionId, engineStatus, isSubmitted, selectedLanguage, callAIEval]);

  // Handle Tab key in textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newCode = code.substring(0, start) + "    " + code.substring(end);
      setCode(newCode);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 4;
      });
    }
  };

  const statusLabel: Record<EngineStatus, string> = {
    loading: `⏳ Loading ${langLabel} engine...`,
    ready: `🟢 ${langLabel} ready`,
    running: "⚙️ Running tests...",
    error: `🔴 ${langLabel} engine error`,
  };

  const allPassed = hasRun && passedCount === testCases.length;
  const somePassed = hasRun && passedCount > 0 && passedCount < testCases.length;

  return (
    <div className={styles.container} style={{ minHeight: "550px" }}>
      {/* Sleek top status and controls header */}
      <div className={styles.statusBar} style={{ padding: "10px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", fontWeight: "bold" }}>Language:</label>
          <select
            value={selectedLanguage}
            onChange={(e) => handleLanguageChange(e.target.value)}
            disabled={isSubmitted}
            style={{
              background: "rgba(0, 0, 0, 0.4)",
              border: "1px solid rgba(139, 92, 246, 0.4)",
              color: "#fff",
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "12px",
              outline: "none",
              cursor: "pointer",
              fontFamily: "'Inter', sans-serif",
              fontWeight: 600,
            }}
          >
            <option value="python">Python</option>
            <option value="c">C</option>
            <option value="cpp">C++</option>
            <option value="java">Java</option>
          </select>
        </div>

        {hasRun && (
          <span
            className={styles.score}
            style={{ color: allPassed ? "#10b981" : somePassed ? "#f59e0b" : "#ef4444" }}
          >
            {passedCount}/{testCases.length} test cases passed
          </span>
        )}
      </div>

      {/* Two Column Split IDE Layout */}
      <div style={{ display: "flex", flex: 1, minHeight: "450px" }}>
        {/* Left Side: Editor Area */}
        <div style={{ flex: "1.2", display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ padding: "6px 12px", background: "rgba(0,0,0,0.2)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.4)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>📝 Editor Workspace</span>
            <span style={{ fontFamily: "monospace", opacity: 0.8 }}>Auto-saved</span>
          </div>
          <div style={{ flex: 1, display: "flex", position: "relative", minHeight: "380px" }}>
            {/* Elegant Line Numbers */}
            <div style={{
              padding: "16px 8px 16px 12px",
              background: "rgba(0,0,0,0.15)",
              color: "rgba(255,255,255,0.25)",
              fontFamily: "'Fira Code', monospace",
              fontSize: "14px",
              lineHeight: "1.6",
              textAlign: "right",
              userSelect: "none",
              borderRight: "1px solid rgba(255,255,255,0.03)"
            }}>
              {Array.from({ length: Math.max(15, code.split("\n").length) }).map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className={styles.editor}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                padding: "16px",
                color: "#e2e8f0",
                fontFamily: "'Fira Code', monospace",
                fontSize: "14px",
                lineHeight: "1.6",
                resize: "none",
                width: "100%",
                height: "100%",
              }}
              value={code}
              onChange={(e) => !isSubmitted && setCode(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSubmitted}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              placeholder={LANG_COMMENTS[selectedLanguage] || `// Write your ${langLabel} solution here`}
            />
          </div>
        </div>

        {/* Right Side: Compiler & Results Panel */}
        <div style={{ flex: "0.8", display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.1)" }}>
          <div style={{ padding: "6px 12px", background: "rgba(0,0,0,0.2)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.4)" }}>
            <span>⚙️ Compiler & Test Console</span>
          </div>

          <div style={{ flex: 1, padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px", maxHeight: "460px" }}>
            {/* Status indicators */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: "8px",
              padding: "8px 12px",
              fontSize: "12px"
            }}>
              <span style={{ color: "rgba(255,255,255,0.6)" }}>Status:</span>
              <span style={{ fontWeight: 600, color: engineStatus === "running" ? "#c084fc" : "#28D7D6" }}>
                {statusLabel[engineStatus]}
              </span>
            </div>

            {/* AI feedback display */}
            {aiFeedback && (
              <div style={{
                background: "rgba(168, 85, 247, 0.08)",
                border: "1px solid rgba(168, 85, 247, 0.2)",
                borderRadius: "8px",
                padding: "10px 12px",
                fontSize: "12px",
                color: "#c084fc",
                lineHeight: "1.4"
              }}>
                🤖 <strong>System Alert:</strong> {aiFeedback}
              </div>
            )}

            {/* Test results listing */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {!hasRun ? (
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: "8px" }}>Test Cases:</div>
                  {testCases.map((tc, idx) => (
                    <div key={idx} style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      fontSize: "12px",
                      marginBottom: "6px"
                    }}>
                      <div style={{ fontWeight: 600, color: "#a5b4fc", marginBottom: "4px" }}>Test Case {idx + 1}</div>
                      {!tc.is_hidden && (
                        <>
                          <div style={{ opacity: 0.5 }}>Input: <code style={{ color: "#fff" }}>{tc.input || "(none)"}</code></div>
                          <div style={{ opacity: 0.5 }}>Expected: <code style={{ color: "#fff" }}>{tc.expected_output}</code></div>
                        </>
                      )}
                      {tc.is_hidden && <div style={{ color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>[Hidden Test Case]</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>Results:</span>
                    <span style={{
                      fontSize: "13px",
                      fontWeight: 800,
                      color: allPassed ? "#10b981" : somePassed ? "#f59e0b" : "#ef4444"
                    }}>
                      {passedCount}/{testCases.length} Passed
                    </span>
                  </div>
                  {results.map((r, i) => (
                    <div
                      key={i}
                      className={`${styles.resultRow} ${r.passed ? styles.resultPass : styles.resultFail}`}
                      style={{ marginBottom: "8px" }}
                    >
                      <div className={styles.resultHeader}>
                        <span className={styles.resultIcon}>{r.passed ? "✅" : "❌"}</span>
                        <span className={styles.resultTitle} style={{ color: r.passed ? "#34d399" : "#f87171" }}>
                          Test Case {i + 1}{r.description ? `: ${r.description}` : ""}
                        </span>
                      </div>
                      {r.input && !r.input.includes("[hidden]") && (
                        <div className={styles.resultDetail}>
                          <span className={styles.detailLabel}>Input:</span>
                          <code>{r.input || "(none)"}</code>
                        </div>
                      )}
                      {r.expected && !r.expected.includes("[hidden]") && (
                        <div className={styles.resultDetail}>
                          <span className={styles.detailLabel}>Expected:</span>
                          <code>{r.expected}</code>
                        </div>
                      )}
                      <div className={styles.resultDetail}>
                        <span className={styles.detailLabel}>Got:</span>
                        <code className={r.passed ? styles.codePass : styles.codeFail}>
                          {r.actual}
                        </code>
                      </div>
                      {r.error && (
                        <div className={styles.resultError}>⚠️ {r.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Compiler Action Footer */}
      <div className={styles.footer} style={{ justifyContent: "space-between", padding: "12px 16px" }}>
        <button
          className={styles.runBtn}
          onClick={handleRun}
          disabled={engineStatus !== "ready" || isSubmitted}
        >
          {engineStatus === "running" ? "⚙️ Running..." : "▶ Run & Test"}
        </button>

        {!isSubmitted ? (
          <button
            onClick={() => {
              if (isSubmitted) return;
              
              // Validate and submit
              const allPassed = hasRun && passedCount === testCases.length;
              const msg = !hasRun 
                ? "You haven't run or tested your code yet. Submitting now will give you 0 points for this question. Do you want to submit and continue?"
                : !allPassed 
                  ? "Some or all of your test cases are failing. Submitting now will give you 0 points for this question. Do you want to submit and continue anyway?"
                  : "Excellent! All test cases are passing. Click OK to submit your answer and go to the next question!";
                  
              if (confirm(msg)) {
                onSubmit(code, results, passedCount, testCases.length);
              }
            }}
            style={{
              padding: "9px 24px",
              background: "linear-gradient(135deg, #10B981, #059669)",
              color: "white",
              border: "none",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: "800",
              cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: "0 4px 14px rgba(16, 185, 129, 0.3)",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 6px 20px rgba(16, 185, 129, 0.4)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow = "0 4px 14px rgba(16, 185, 129, 0.3)";
            }}
          >
            Submit & Continue →
          </button>
        ) : (
          <span className={styles.submittedLabel}>Answer submitted — locked.</span>
        )}
      </div>
    </div>
  );
}
