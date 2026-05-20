import re
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx
import asyncio
from .auth import get_current_student
from core.config import get_settings
import math

# --- Smart Semantic Matcher (Parity with Client-Side Worker) ---
def try_parse_json_like(s: str):
    if not s: return None
    cleaned = s.strip()
    try: return json.loads(cleaned)
    except: pass
    try:
        # replace Python-style with JSON-style
        js_str = cleaned.replace("'", '"')
        js_str = re.sub(r'\bTrue\b', 'true', js_str)
        js_str = re.sub(r'\bFalse\b', 'false', js_str)
        js_str = re.sub(r'\bNone\b', 'null', js_str)
        return json.loads(js_str)
    except: pass
    return None

def deep_equal(a, b):
    if a == b: return True
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(a, b, abs_tol=1e-5)
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b): return False
        return all(deep_equal(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        if len(a) != len(b): return False
        for k in a:
            if k not in b: return False
            if not deep_equal(a[k], b[k]): return False
        return True
    try:
        if str(a) != "" and str(b) != "":
            return math.isclose(float(a), float(b), abs_tol=1e-5)
    except: pass
    return False

def normalize_string(s: str) -> str:
    if not isinstance(s, str): return ""
    s = s.strip().lower()
    s = re.sub(r'\r?\n', ' ', s)
    s = re.sub(r'\s+', ' ', s)
    s = re.sub(r'[\'"]', '"', s)
    s = re.sub(r',\s*([\]}])', r'\1', s)
    return s.strip()

def extract_json(s: str):
    match = re.search(r'(\{|\[)[\s\S]*(\}|\])', s)
    if match:
        return try_parse_json_like(match.group(0))
    return None

def smart_compare(got: str, expected: str) -> bool:
    got_str = str(got or "").strip()
    expected_str = str(expected or "").strip()
    if got_str == expected_str: return True
    
    # 1. Normalize strings
    norm_got = normalize_string(got_str)
    norm_expected = normalize_string(expected_str)
    if norm_got == norm_expected: return True
    
    # 2. Substring match for robust detection (e.g. "The answer is 42" containing "42")
    if norm_expected and norm_expected in norm_got: return True

    # 3. JSON handling
    expected_obj = try_parse_json_like(expected_str)
    if expected_obj is not None:
        got_obj = try_parse_json_like(got_str)
        if got_obj is None:
            got_obj = extract_json(got_str)
        if got_obj is not None and deep_equal(got_obj, expected_obj):
            return True
            
    # 4. Float and number extraction handling
    try:
        if expected_str != "":
            expected_float = float(expected_str)
            if got_str != "":
                if math.isclose(float(got_str), expected_float, abs_tol=1e-5): return True
            
            # Extract numbers from got
            numbers = re.findall(r'-?\d+(?:\.\d+)?', got_str)
            for n in numbers:
                if math.isclose(float(n), expected_float, abs_tol=1e-5): return True
    except: pass
    
    return False
# ----------------------------------------------------------------
router = APIRouter(prefix="/exam/pyhunt", tags=["PyHunt Engine"])

class TestCase(BaseModel):
    input: str
    expected: str

class VerifyRequest(BaseModel):
    code: str
    test_cases: List[TestCase]
    question_text: Optional[str] = None
    language: Optional[str] = "python"
    ask_ai: Optional[bool] = False

piston_semaphore = asyncio.Semaphore(15) # Increased concurrent connections to Piston for scaling

async def verify_piston(client: httpx.AsyncClient, code: str, test_cases: List[TestCase]):
    """Tier 1: Piston API (Gold Standard - Batched)"""
    async with piston_semaphore:
        test_cases_json = json.dumps([{"input": tc.input, "expected": tc.expected} for tc in test_cases])
        
        # We wrap the student code in a script that executes all test cases in ONE process
        runner_code = f"""
import sys
import io
import json
import traceback

student_code = {repr(code)}
test_cases = json.loads({repr(test_cases_json)})

results = []

for tc in test_cases:
    tc_input = tc['input']
    tc_expected = tc['expected']
    
    sys.stdin = io.StringIO(tc_input)
    old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    
    error = ""
    try:
        # Use fresh globals dictionary so test cases don't leak state
        exec(student_code, {{"__name__": "__main__"}})
    except Exception as e:
        error = str(e)
        
    output = sys.stdout.getvalue()
    sys.stdout = old_stdout
    
    results.append({{
        "got": error if error else output,
        "expected": tc_expected,
        "error": bool(error)
    }})

print("---PISTON_BATCH_RESULT---")
print(json.dumps(results))
"""
        
        payload = {
            "language": "python",
            "files": [{"name": "main.py", "content": runner_code}],
            "run_timeout": 5000
        }
        
        for attempt in range(3):
            resp = await client.post("https://emkc.org/api/v2/piston/execute", json=payload, timeout=8.0)
            if resp.status_code == 429:
                await asyncio.sleep(1.0 * (attempt + 1))
                continue
            if resp.status_code != 200:
                raise Exception(f"Piston API Error {resp.status_code}: {resp.text}")
                
            data = resp.json()
            stdout = data.get("run", {}).get("stdout", "")
            stderr = data.get("run", {}).get("stderr", "")
            
            if "---PISTON_BATCH_RESULT---" in stdout:
                json_str = stdout.split("---PISTON_BATCH_RESULT---")[-1].strip()
                try:
                    batch_results = json.loads(json_str)
                    final_results = []
                    all_pass = True
                    for br in batch_results:
                        is_correct = False
                        if not br["error"]:
                            is_correct = smart_compare(br["got"], br["expected"])
                        if not is_correct: all_pass = False
                        final_results.append({
                            "pass": is_correct,
                            "got": br["got"].strip() or "No output",
                            "expected": br["expected"]
                        })
                    return {"ok": True, "results": final_results, "all_pass": all_pass, "engine": "Piston v2 (Batched Python)"}
                except: pass
                
            raise Exception(f"Batch execution failed to parse. stdout: {stdout}, stderr: {stderr}")
        raise Exception("Piston Rate Limit Exceeded after retries.")

async def run_piston_single(client: httpx.AsyncClient, code: str, language: str, stdin: str) -> dict:
    lang = language.lower().strip()
    if lang in ["c++", "cpp"]:
        lang_piston = "cpp"
        filename = "main.cpp"
    elif lang == "c":
        lang_piston = "c"
        filename = "main.c"
    elif lang == "java":
        lang_piston = "java"
        filename = "Main.java"
    else:
        lang_piston = "python"
        filename = "main.py"

    payload = {
        "language": lang_piston,
        "version": "*",
        "files": [{"name": filename, "content": code}],
        "stdin": stdin,
        "run_timeout": 5000
    }

    for attempt in range(3):
        resp = await client.post("https://emkc.org/api/v2/piston/execute", json=payload, timeout=8.0)
        if resp.status_code == 429:
            await asyncio.sleep(0.5 * (attempt + 1))
            continue
        if resp.status_code != 200:
            raise Exception(f"Piston API Error {resp.status_code}: {resp.text}")
        
        data = resp.json()
        compile_data = data.get("compile", {})
        run_data = data.get("run", {})
        
        compile_output = compile_data.get("output", "")
        compile_stderr = compile_data.get("stderr", "")
        compile_code = compile_data.get("code")
        
        run_stdout = run_data.get("stdout", "")
        run_stderr = run_data.get("stderr", "")
        run_code = run_data.get("code")
        
        if compile_code is not None and compile_code != 0:
            err_msg = compile_output or compile_stderr or "Compilation failed"
            return {"got": err_msg, "error": True}
            
        if run_stderr:
            if run_code is not None and run_code != 0:
                err_msg = run_stderr or run_data.get("output", "")
                return {"got": err_msg, "error": True}
        
        return {
            "got": run_stdout,
            "error": False
        }
    raise Exception("Piston Rate Limit Exceeded after retries.")

async def verify_piston_non_python(client: httpx.AsyncClient, code: str, language: str, test_cases: List[TestCase]):
    async with piston_semaphore:
        tasks = [
            run_piston_single(client, code, language, tc.input)
            for tc in test_cases
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        final_results = []
        all_pass = True
        
        for idx, res in enumerate(results):
            tc = test_cases[idx]
            if isinstance(res, Exception):
                all_pass = False
                final_results.append({
                    "pass": False,
                    "got": f"Execution Error: {str(res)}",
                    "expected": tc.expected
                })
            else:
                is_correct = False
                got_val = res["got"]
                if not res["error"]:
                    is_correct = smart_compare(got_val, tc.expected)
                if not is_correct:
                    all_pass = False
                final_results.append({
                    "pass": is_correct,
                    "got": got_val.strip() or "No output",
                    "expected": tc.expected
                })
        
        return {
            "ok": True,
            "results": final_results,
            "all_pass": all_pass,
            "engine": f"Piston v2 ({language.upper()})"
        }

async def verify_groq(client: httpx.AsyncClient, code: str, test_cases: List[TestCase], model: str, language: str, question_text: Optional[str] = None):
    """Tier 2 & 3: Groq AI (Intelligence Fallback)"""
    settings = get_settings()
    if not settings.groq_api_key or "your_key" in settings.groq_api_key: return None
    
    prompt = f"You are a strict {language.upper()} Code Judge. Verify the following {language.upper()} code against the provided test cases and question context.\n"
    if question_text:
        prompt += f"\n[QUESTION CONTEXT]\n{question_text}\n"
    
    prompt += "\nRequirements:\n"
    prompt += "1. Output & Semantic Match: Does the student's output or logic semantically answer the problem? If they used a different logic/method but arrived at the correct answer or conceptually correct output, MARK IT AS PASS ('pass': true).\n"
    prompt += "2. Security Check: Ensure the code is not attempting to bypass tests by hardcoding outputs for specific inputs.\n"
    prompt += f"\nCode:\n{code}\n\nTest Cases:\n"
    for i, tc in enumerate(test_cases):
        prompt += f"{i+1}. Input: {tc.input} | Expected Core Value: {tc.expected}\n"
    prompt += "\nReturn ONLY a JSON object with 'results' (list of {'pass': bool, 'got': string, 'expected': string}) and 'all_pass': bool."

    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": f"You are a {language.upper()} code judge. Output strict JSON only."},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"}
    }
    
    resp = await client.post(f"{settings.groq_base_url}/chat/completions", json=payload, headers=headers, timeout=8.0)
    data = resp.json()
    content = data["choices"][0]["message"]["content"]
    return json.loads(content)

def verify_regex_emergency(code: str, test_cases: List[TestCase]):
    """Tier 4: Local Regex (Emergency Backup)"""
    results = []
    has_print = any(x in code.lower() for x in ["print", "printf", "cout", "system.out"])
    for tc in test_cases:
        results.append({
            "pass": has_print,
            "got": "Emergency Regex Check Active" if has_print else "No output statement detected",
            "expected": tc.expected
        })
    return {"ok": True, "results": results, "all_pass": has_print, "engine": "Local Regex (Emergency)"}

@router.post("/verify")
async def verify_code(request: VerifyRequest, current: dict = Depends(get_current_student)):
    """
    High-Concurrency Optimization Layer (HCOL) - Tiered Failover Path
    1. Plan A (Piston): Sandboxed execution
    2. Plan B (Groq 70B): Intelligence fallback (Only if ask_ai is True)
    3. Plan C (Groq 8B): High-speed fallback (Only if ask_ai is True)
    4. Plan D (Regex): Emergency local check
    """
    lang = (request.language or "python").lower().strip()
    is_python = lang in ["python", "py"]
    
    async with httpx.AsyncClient() as client:
        piston_res = None
        try:
            if is_python:
                piston_res = await verify_piston(client, request.code, request.test_cases)
            else:
                piston_res = await verify_piston_non_python(client, request.code, lang, request.test_cases)
            
            # If all test cases passed, or if we don't want AI fallback, return immediately!
            if (piston_res and piston_res.get("all_pass")) or not request.ask_ai:
                return piston_res
                
            print(f"[HCOL] Code failed strict tests. Sending to Groq AI for logic evaluation...")
        except Exception as e:
            print(f"[HCOL] Piston Failed: {e}. Falling back to Groq if requested...")
            if not request.ask_ai:
                # If we don't want AI fallback, return a structured Piston failure
                results = []
                for tc in request.test_cases:
                    results.append({
                        "pass": False,
                        "got": f"Execution Error: {str(e)}",
                        "expected": tc.expected
                    })
                return {"ok": False, "results": results, "all_pass": False, "engine": "Piston (Error)"}

        # Tiers 2 & 3 (Groq AI) — Only executed if request.ask_ai is True
        if request.ask_ai:
            try:
                res = await verify_groq(client, request.code, request.test_cases, "llama-3.1-70b-versatile", lang, request.question_text)
                if res: 
                    if res.get("all_pass"):
                        res["engine"] = f"Groq Llama 3.1 70B (AI Override - {lang.title()})"
                        res["ok"] = True
                        return res
                    elif piston_res:
                        return piston_res
            except Exception as e:
                print(f"[HCOL] Groq 70B Failed: {e}. Falling back to Groq 8B...")

            try:
                res = await verify_groq(client, request.code, request.test_cases, "llama-3.1-8b-instant", lang, request.question_text)
                if res:
                    if res.get("all_pass"):
                        res["engine"] = f"Groq Llama 3.1 8B (AI Override - {lang.title()})"
                        res["ok"] = True
                        return res
                    elif piston_res:
                        return piston_res
            except Exception as e:
                print(f"[HCOL] Groq 8B Failed: {e}. Falling back to Emergency Regex...")
            
        if piston_res:
            return piston_res

        # Tier 4: Emergency Regex (Now returns ok: False to trigger frontend fallback)
        emergency = verify_regex_emergency(request.code, request.test_cases)
        emergency["ok"] = False
        return emergency
