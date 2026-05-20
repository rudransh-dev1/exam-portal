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

piston_semaphore = asyncio.Semaphore(5) # Max 5 concurrent connections to Piston to avoid 429 Rate Limits

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
                    return {"ok": True, "results": final_results, "all_pass": all_pass, "engine": "Piston v2 (Batched)"}
                except: pass
                
            raise Exception(f"Batch execution failed to parse. stdout: {stdout}, stderr: {stderr}")
        raise Exception("Piston Rate Limit Exceeded after retries.")

async def verify_groq(client: httpx.AsyncClient, code: str, test_cases: List[TestCase], model: str, question_text: Optional[str] = None):
    """Tier 2 & 3: Groq AI (Intelligence Fallback)"""
    settings = get_settings()
    if not settings.groq_api_key or "your_key" in settings.groq_api_key: return None
    
    prompt = "You are a strict Python Code Judge. Verify the following Python code against the provided test cases and question context.\n"
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
            {"role": "system", "content": "You are a Python code judge. Output strict JSON only."},
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
    has_print = "print" in code.lower()
    for tc in test_cases:
        results.append({
            "pass": has_print,
            "got": "Emergency Regex Check Active" if has_print else "No print statement detected",
            "expected": tc.expected
        })
    return {"ok": True, "results": results, "all_pass": has_print, "engine": "Local Regex (Emergency)"}

@router.post("/verify")
async def verify_code(request: VerifyRequest, current: dict = Depends(get_current_student)):
    """
    High-Concurrency Optimization Layer (HCOL) - Tiered Failover Path
    1. Plan A (Piston): Sandboxed execution
    2. Plan B (Groq 70B): Intelligence fallback
    3. Plan C (Groq 8B): High-speed fallback
    4. Plan D (Regex): Emergency local check
    """
    async with httpx.AsyncClient() as client:
        # Tier 1: Piston
        piston_res = None
        try:
            piston_res = await verify_piston(client, request.code, request.test_cases)
            if piston_res and piston_res.get("all_pass"):
                return piston_res
            else:
                print(f"[HCOL] Code failed strict Piston tests. Sending to Groq AI for logic evaluation...")
        except Exception as e:
            print(f"[HCOL] Piston Failed: {e}. Falling back to Groq...")

        # Tiers 2 & 3 (Groq AI)
        try:
            res = await verify_groq(client, request.code, request.test_cases, "llama-3.1-70b-versatile", request.question_text)
            if res: 
                if res.get("all_pass"):
                    res["engine"] = "Groq Llama 3.1 70B (AI Override)"
                    res["ok"] = True
                    return res
                elif piston_res:
                    return piston_res
        except Exception as e:
            print(f"[HCOL] Groq 70B Failed: {e}. Falling back to Groq 8B...")

        try:
            res = await verify_groq(client, request.code, request.test_cases, "llama-3.1-8b-instant", request.question_text)
            if res:
                if res.get("all_pass"):
                    res["engine"] = "Groq Llama 3.1 8B (AI Override)"
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
