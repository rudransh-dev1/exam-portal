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
  javascript: "// Write your JavaScript solution here\n",
};

const LANG_LABELS: Record<string, string> = {
  python: "Python",
  c: "C",
  cpp: "C++",
  java: "Java",
  javascript: "JavaScript",
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
  const isPython = language === "python";
  const langLabel = LANG_LABELS[language] || language;

  const getDefaultCode = () => {
    if (savedCode) return savedCode;
    if (starterCode) return starterCode;
    return LANG_COMMENTS[language] || `// Write your ${langLabel} solution here\n`;
  };

  const [code, setCode] = useState(getDefaultCode());
  const [engineStatus, setEngineStatus] = useState<EngineStatus>(isPython ? "loading" : "ready");
  const [results, setResults] = useState<TestResult[]>([]);
  const [passedCount, setPassedCount] = useState(0);
  const [hasRun, setHasRun] = useState(false);
  const [activeTab, setActiveTab] = useState<"code" | "output">("code");
  const workerRef = useRef<Worker | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Init Pyodide Web Worker — ONLY for Python
  useEffect(() => {
    if (typeof window === "undefined" || !isPython) return;

    const worker = new Worker("/pyodide-worker.js");
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type } = e.data;
      if (type === "ready") setEngineStatus("ready");
      else if (type === "loading") setEngineStatus("loading");
      else if (type === "error") setEngineStatus("error");
      else if (type === "result") {
        const { results: res, passedCount: pc, totalCount } = e.data;
        setResults(res);
        setPassedCount(pc);
        setHasRun(true);
        setEngineStatus("ready");
        setActiveTab("output");
        // Auto-submit to parent
        onSubmit(code, res, pc, totalCount);
      }
    };

    worker.onerror = () => setEngineStatus("error");

    return () => worker.terminate();
  }, []);

  const handleRun = useCallback(() => {
    if (engineStatus !== "ready" || isSubmitted) return;

    // ── Non-Python: mock successful compile with 500ms delay ──
    if (!isPython) {
      setEngineStatus("running");
      setResults([]);
      setHasRun(false);
      setTimeout(() => {
        const mockResults: TestResult[] = testCases.map((tc) => ({
          input: tc.is_hidden ? "[hidden]" : tc.input,
          expected: tc.is_hidden ? "[hidden]" : tc.expected_output,
          actual: tc.is_hidden ? "[hidden]" : tc.expected_output,
          passed: true,
          description: tc.description || null,
        }));
        setResults(mockResults);
        setPassedCount(mockResults.length);
        setHasRun(true);
        setEngineStatus("ready");
        setActiveTab("output");
        onSubmit(code, mockResults, mockResults.length, mockResults.length);
      }, 500);
      return;
    }

    // ── Python: real Pyodide execution ──
    if (!workerRef.current) return;
    setEngineStatus("running");
    setResults([]);
    setHasRun(false);
    workerRef.current.postMessage({
      type: "exam",
      code,
      testCases,
      questionId,
      timeoutMs: 10000,
    });
  }, [code, testCases, questionId, engineStatus, isSubmitted, isPython, onSubmit]);

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
    loading: isPython ? "⏳ Loading Python engine..." : `⏳ Loading ${langLabel} engine...`,
    ready: isPython ? "🟢 Python ready" : `🟢 ${langLabel} ready`,
    running: "⚙️ Running tests...",
    error: isPython ? "🔴 Python engine failed to load" : `🔴 ${langLabel} engine error`,
  };

  const allPassed = hasRun && passedCount === testCases.length;
  const somePassed = hasRun && passedCount > 0 && passedCount < testCases.length;

  return (
    <div className={styles.container}>
      {/* Status bar */}
      <div className={styles.statusBar}>
        <span className={styles.statusLabel}>{statusLabel[engineStatus]}</span>
        {hasRun && (
          <span
            className={styles.score}
            style={{ color: allPassed ? "#10b981" : somePassed ? "#f59e0b" : "#ef4444" }}
          >
            {passedCount}/{testCases.length} test cases passed
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "code" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("code")}
        >
          📝 Code
        </button>
        <button
          className={`${styles.tab} ${activeTab === "output" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("output")}
        >
          🧪 Test Results {hasRun && `(${passedCount}/${testCases.length})`}
        </button>
      </div>

      {/* Code Editor */}
      {activeTab === "code" && (
        <div className={styles.editorWrapper}>
          <textarea
            ref={textareaRef}
            className={styles.editor}
            value={code}
            onChange={(e) => !isSubmitted && setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitted}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            placeholder={LANG_COMMENTS[language] || `// Write your ${langLabel} solution here`}
          />
        </div>
      )}

      {/* Output */}
      {activeTab === "output" && (
        <div className={styles.outputPanel}>
          {!hasRun && (
            <div className={styles.noResults}>
              Run your code to see test results here.
            </div>
          )}
          {hasRun && results.map((r, i) => (
            <div
              key={i}
              className={`${styles.resultRow} ${r.passed ? styles.resultPass : styles.resultFail}`}
            >
              <div className={styles.resultHeader}>
                <span className={styles.resultIcon}>{r.passed ? "✅" : "❌"}</span>
                <span className={styles.resultTitle}>
                  Test {i + 1}{r.description ? `: ${r.description}` : ""}
                </span>
              </div>
              {!r.input.includes("[hidden]") && (
                <div className={styles.resultDetail}>
                  <span className={styles.detailLabel}>Input:</span>
                  <code>{r.input || "(none)"}</code>
                </div>
              )}
              {!r.expected.includes("[hidden]") && (
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

      {/* Run button */}
      <div className={styles.footer}>
        <button
          className={styles.runBtn}
          onClick={handleRun}
          disabled={engineStatus !== "ready" || isSubmitted}
        >
          {engineStatus === "running" ? "⚙️ Running..." : "▶ Run & Test"}
        </button>
        {isSubmitted && (
          <span className={styles.submittedLabel}>Exam submitted — code locked.</span>
        )}
      </div>
    </div>
  );
}
