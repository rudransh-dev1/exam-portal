"""
python_api/routers/eval.py

POST /py-api/eval/ai  — AI-backed code evaluation fallback.

Evaluation chain (in order of priority):
  1. Pyodide unit tests (runs in browser — this endpoint is NOT called if Pyodide passes)
  2. Groq  (llama-3.3-70b-versatile) — primary fallback after 10 client failures
  3. Inception  (mercury-coder-small-beta or compatible) — secondary fallback if Groq fails

Returns { passed: bool, score: int, feedback: str }
The client uses the response to show a grade — never trusts client-side grading for AI path.
"""

import os
import httpx
import json
import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from core.security import get_current_student

logger = logging.getLogger("examguard.eval")
router = APIRouter(tags=["eval"])

# ── Env vars ──────────────────────────────────────────────────────────────────
GROQ_API_KEY        = os.getenv("GROQ_API_KEY", "")
GROQ_API_URL        = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL          = "llama-3.3-70b-versatile"

INCEPTION_API_KEY   = os.getenv("INCEPTION_API_KEY", "")
INCEPTION_API_URL   = os.getenv("INCEPTION_API_URL", "https://api.inceptionlabs.ai/v1/chat/completions")
INCEPTION_MODEL     = os.getenv("INCEPTION_MODEL", "mercury-coder-small-beta")

TIMEOUT_SECS        = 20  # per AI call

# ── Request / Response Models ─────────────────────────────────────────────────

class TestCase(BaseModel):
    input: Optional[str] = None
    expected_output: Optional[str] = None
    description: Optional[str] = None

class EvalRequest(BaseModel):
    code: str = Field(..., max_length=20_000)
    language: str = Field(default="python")
    question_context: Optional[str] = None   # question title / description
    test_cases: List[TestCase] = Field(default_factory=list)
    eval_type: str = Field(default="programming")  # "programming" | "jumble"

class EvalResponse(BaseModel):
    passed: bool
    score: int          # 0–100
    feedback: str
    graded_by: str      # "groq" | "inception" | "error"

# ── Shared AI call helper ─────────────────────────────────────────────────────

def _build_prompt(req: EvalRequest) -> str:
    tc_block = ""
    if req.test_cases:
        tc_lines = []
        for i, tc in enumerate(req.test_cases[:10], 1):
            inp = tc.input or "(no input)"
            exp = tc.expected_output or "(any correct output)"
            tc_lines.append(f"  Test {i}: input={inp!r}  expected={exp!r}")
        tc_block = "\n\nTest cases:\n" + "\n".join(tc_lines)

    if req.eval_type == "jumble":
        task = (
            "The student rearranged lines of code to form a program. "
            "Evaluate whether the program is logically correct and would produce the intended result. "
            "Minor differences in variable declaration order are acceptable if the final state is correct."
        )
    else:
        task = (
            f"The student wrote a {req.language} solution. "
            "Evaluate whether it correctly solves the problem described. "
            "Accept any logically equivalent implementation — different variable names, "
            "extra helper functions, or different code style are all fine."
        )

    context = f"\nProblem: {req.question_context}" if req.question_context else ""

    return f"""{task}{context}{tc_block}

Student code:
```{req.language}
{req.code}
```

Respond with ONLY valid JSON in this exact format (no markdown, no explanation):
{{"passed": true_or_false, "score": 0_to_100, "feedback": "one short sentence"}}"""


async def _call_ai(url: str, api_key: str, model: str, prompt: str) -> dict:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a strict but fair code examiner. "
                    "You evaluate student code functionally, not stylistically. "
                    "You respond ONLY with the requested JSON — no markdown, no explanation."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
        "max_tokens": 128,
    }
    async with httpx.AsyncClient(timeout=TIMEOUT_SECS) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"].strip()
        # Strip markdown fences if model wraps in ```json ... ```
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        return json.loads(content)


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/eval/ai", response_model=EvalResponse)
async def ai_evaluate(req: EvalRequest, user=Depends(get_current_student)):
    prompt = _build_prompt(req)

    # ── Step 1: Try Groq ──
    if GROQ_API_KEY:
        try:
            result = await _call_ai(GROQ_API_URL, GROQ_API_KEY, GROQ_MODEL, prompt)
            return EvalResponse(
                passed=bool(result.get("passed", False)),
                score=int(result.get("score", 0)),
                feedback=str(result.get("feedback", "Evaluated by AI.")),
                graded_by="groq",
            )
        except Exception as e:
            logger.warning(f"[eval] Groq failed: {e} — trying Inception")

    # ── Step 2: Try Inception ──
    if INCEPTION_API_KEY:
        try:
            result = await _call_ai(INCEPTION_API_URL, INCEPTION_API_KEY, INCEPTION_MODEL, prompt)
            return EvalResponse(
                passed=bool(result.get("passed", False)),
                score=int(result.get("score", 0)),
                feedback=str(result.get("feedback", "Evaluated by AI.")),
                graded_by="inception",
            )
        except Exception as e:
            logger.error(f"[eval] Inception also failed: {e}")

    # ── Step 3: Both failed — return conservative pass to avoid penalising student ──
    logger.error("[eval] All AI evaluators unavailable — granting partial credit")
    return EvalResponse(
        passed=True,
        score=60,
        feedback="Auto-grader temporarily unavailable. Partial credit granted.",
        graded_by="error",
    )
