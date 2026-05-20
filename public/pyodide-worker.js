/**
 * pyodide-worker.js  v4
 * Handles 3 message formats:
 *  1. { id, type:"run", code, stdin }
 *  2. { id, type:"testCases", code, testCases:[{input, expected}] }    ← pyhunt format
 *  3. { id, code, testCases:[{input, expected_output, ...}] }           ← exam grading format
 */

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js";

let pyodideInstance = null;
let pyodideLoading  = null;

async function loadPyodideOnce() {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideLoading)  return pyodideLoading;
  pyodideLoading = (async () => {
    importScripts(PYODIDE_CDN);
    const pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/" });
    pyodideInstance = pyodide;
    return pyodide;
  })();
  return pyodideLoading;
}

// Warm up
loadPyodideOnce()
  .then(() => postMessage({ type: "ready" }))
  .catch((err) => postMessage({ type: "error", message: "Pyodide failed to load: " + String(err) }));

/* ── Run one code block, capture stdout/stderr ── */
async function runSingle(pyodide, code, stdinLines, timeLimitMs = 15000) {
  const safeInput = JSON.stringify(Array.isArray(stdinLines) ? stdinLines : []);
  const setup = `
import sys, io, builtins
_stdout_buf = io.StringIO()
_stderr_buf = io.StringIO()
sys.stdout = _stdout_buf
sys.stderr = _stderr_buf
_input_lines = ${safeInput}
_input_str = "\\n".join(str(x) for x in _input_lines) + ("\\n" if _input_lines else "")
sys.stdin = io.StringIO(_input_str)
def input(prompt=''):
    line = sys.stdin.readline()
    if not line:
        return ''
    return line.rstrip('\\r\\n')
builtins.input = input
`;
  const teardown = `
sys.stdout.flush(); sys.stderr.flush()
__out = _stdout_buf.getvalue()
__err = _stderr_buf.getvalue()
`;

  let stdout = "", stderr = "";
  await Promise.race([
    (async () => {
      await pyodide.runPythonAsync(setup);
      await pyodide.runPythonAsync(code);
      await pyodide.runPythonAsync(teardown);
      stdout = pyodide.globals.get("__out") || "";
      stderr = pyodide.globals.get("__err") || "";
    })(),
    new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout after " + timeLimitMs + "ms")), timeLimitMs)),
  ]);
  return { stdout, stderr };
}

/* ── Smart Semantic Matcher ── */
function tryParseJSONLike(str) {
  if (!str) return null;
  let cleaned = str.trim();
  try { return JSON.parse(cleaned); } catch (e) {}
  try {
    let jsStr = cleaned
      .replace(/'/g, '"')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null');
    return JSON.parse(jsStr);
  } catch (e) {}
  return null;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 1e-5;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  if (!isNaN(Number(a)) && !isNaN(Number(b)) && a !== "" && b !== "") {
    return Math.abs(Number(a) - Number(b)) < 1e-5;
  }
  return false;
}

function normalizeString(str) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/['"]/g, '"')
    .replace(/,\s*([\]}])/g, '$1')
    .trim();
}

function extractJSON(str) {
  const jsonRegex = /(\{|\[)[\s\S]*(\}|\])/;
  const match = str.match(jsonRegex);
  if (match) {
    return tryParseJSONLike(match[0]);
  }
  return null;
}

function smartCompare(got, expected) {
  const gotStr = String(got || "").trim();
  const expectedStr = String(expected || "").trim();
  if (gotStr === expectedStr) return true;
  if (!isNaN(Number(gotStr)) && !isNaN(Number(expectedStr)) && gotStr !== "" && expectedStr !== "") {
    if (Math.abs(Number(gotStr) - Number(expectedStr)) < 1e-5) return true;
  }
  
  const expectedObj = tryParseJSONLike(expectedStr);
  if (expectedObj !== null) {
    const gotObj = tryParseJSONLike(gotStr) || extractJSON(gotStr);
    if (gotObj !== null && deepEqual(gotObj, expectedObj)) return true;
  }
  
  if (normalizeString(gotStr) === normalizeString(expectedStr)) return true;
  return false;
}

/* ── Message handler ── */
self.onmessage = async (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  const { id } = msg;

  let pyodide;
  try {
    pyodide = await loadPyodideOnce();
  } catch (err) {
    postMessage({ id, type: "result", error: "Pyodide unavailable: " + String(err), results: [], stdout: "", stderr: "" });
    return;
  }

  /* ─ FORMAT 1: type="run" — single code run ─ */
  if (msg.type === "run") {
    const stdinLines = typeof msg.stdin === "string" ? msg.stdin.split(/\r?\n/).filter(Boolean) : [];
    try {
      const { stdout, stderr } = await runSingle(pyodide, msg.code, stdinLines);
      postMessage({ id, type: "result", stdout, stderr, error: null });
    } catch (err) {
      let stdout = "", stderr = "";
      try {
        await pyodide.runPythonAsync("__out = _stdout_buf.getvalue() if '_stdout_buf' in dir() else ''\n__err = _stderr_buf.getvalue() if '_stderr_buf' in dir() else ''");
        stdout = pyodide.globals.get("__out") || "";
        stderr = pyodide.globals.get("__err") || "";
      } catch {}
      postMessage({ id, type: "result", stdout, stderr: stderr || String(err), error: String(err) });
    }
    return;
  }

  /* ─ FORMAT 2: type="testCases" — pyhunt format [{input, expected}] ─ */
  if (msg.type === "testCases") {
    const testCases = Array.isArray(msg.testCases) ? msg.testCases : [];
    const results = [];
    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const inputLines = typeof tc.input === "string" ? tc.input.split(/\r?\n/).filter(Boolean) : [];
      const expected   = String(tc.expected || "").trim();
      try {
        const { stdout, stderr } = await runSingle(pyodide, msg.code, inputLines, 12000);
        const got  = stdout.trim();
        const pass = smartCompare(got, expected);
        results.push({ pass, got, expected, stderr });
      } catch (err) {
        results.push({ pass: false, got: "", expected, error: String(err) });
      }
    }
    const allPass = results.length > 0 && results.every(r => r.pass);
    postMessage({ id, type: "result", results, allPass });
    return;
  }

  /* ─ FORMAT 3: exam grading format — testCases with expected_output ─ */
  const testCases = Array.isArray(msg.testCases) ? msg.testCases : [];
  const results = [];
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const inputLines = typeof tc.input === "string" ? tc.input.split(/\r?\n/).filter(Boolean) : [];
    try {
      const { stdout } = await runSingle(pyodide, msg.code, inputLines, msg.timeLimitMs || 10000);
      const actual   = stdout.trim();
      const expected = String(tc.expected_output || "").trim();
      const passed   = smartCompare(actual, expected);
      results.push({
        index: i,
        passed,
        actual_output:   tc.is_hidden ? (passed ? "[correct]" : "[incorrect]") : actual,
        expected_output: tc.is_hidden ? "[hidden]" : expected,
        description: tc.description || `Test ${i + 1}`,
        is_hidden: !!tc.is_hidden,
        error: null,
      });
    } catch (err) {
      results.push({
        index: i, passed: false,
        actual_output: "", expected_output: tc.is_hidden ? "[hidden]" : String(tc.expected_output || ""),
        description: tc.description || `Test ${i + 1}`,
        is_hidden: !!tc.is_hidden,
        error: String(err),
      });
    }
  }
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  postMessage({ id, type: "result", results, passedCount, totalCount, error: null });
};
