"""
/api/start_exam  — create or resume an exam session
/api/final_submit — mark session ended, freeze responses
/api/export_session — admin-only session snapshot download

FIXED: Uses exam_config table (not 'exams'). Uses student id (TEXT) not UUID.
"""
import uuid
import hashlib
import random
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from db.supabase_client import get_supabase
from core.security import get_current_student

router = APIRouter(tags=["sessions"])


def _require_admin(user: dict):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


# ── /api/start_exam ──────────────────────────────────────────────────────────

class StartExamRequest(BaseModel):
    exam_name: str          # matches exam_config.exam_title / questions.exam_name
    client_ts: Optional[int] = None

@router.post("/start_exam")
async def start_exam(req: StartExamRequest, user=Depends(get_current_student)):
    sb = get_supabase()

    # 1. Look up exam_config
    cfg_resp = (
        sb.table("exam_config")
        .select("*")
        .ilike("exam_title", req.exam_name)
        .limit(1)
        .execute()
    )
    if not cfg_resp.data:
        raise HTTPException(status_code=404, detail="Exam not found")

    exam = cfg_resp.data[0]
    if not exam.get("is_active"):
        raise HTTPException(status_code=403, detail="Exam is not active")

    user_id = user.get("id")
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=exam.get("duration_minutes", 20))

    # 2. Manage Quiz Session
    session_id = None
    question_order = None
    
    try:
        # Check for existing active session
        existing = (
            sb.table("quiz_sessions")
            .select("*")
            .eq("exam_id", exam["id"])
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )

        if existing.data:
            session_data = existing.data
            if session_data.get("status") in ["SUBMITTED", "TERMINATED"]:
                raise HTTPException(status_code=409, detail=f"Exam already {session_data.get('status').lower()}")
            
            session_id = session_data["id"]
            question_order = session_data.get("metadata", {}).get("question_order")
            
            # Update last activity
            sb.table("quiz_sessions").update({
                "metadata": {**session_data.get("metadata", {}), "last_activity_at": now.isoformat()}
            }).eq("id", session_id).execute()
        else:
            # Create new session
            ins = sb.table("quiz_sessions").insert({
                "exam_id": exam["id"],
                "user_id": user_id,
                "category": exam.get("category", "Others"),
                "status": "ACTIVE",
                "metadata": {
                    "client_ts_start": req.client_ts,
                    "branch": user.get("branch", ""),
                    "exam_name": exam.get("exam_title")
                }
            }).execute()
            if not ins.data:
                raise HTTPException(status_code=500, detail="Failed to create session")
            session_id = ins.data[0]["id"]
            
            # Log session start telemetry
            sb.table("quiz_telemetry").insert({
                "session_id": session_id,
                "event_type": "SESSION_START",
                "payload": {"client_ts": req.client_ts, "ip": user.get("ip", "unknown")},
                "created_at": now.isoformat()
            }).execute()
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"[SESSIONS] Error in quiz_sessions: {e}")
        # Fallback to legacy if needed, but we are hardening
        raise HTTPException(status_code=500, detail="Database session error. Ensure migration v10 is applied.")

    # 3. Fetch Questions
    try:
        q_resp = (
            sb.table("questions")
            .select("id, text, marks, question_type, audio_url, image_url")
            .ilike("exam_name", req.exam_name)
            .order("order_index")
            .execute()
        )
    except Exception:
        q_resp = (
            sb.table("questions")
            .select("id, text, marks, question_type, image_url")
            .ilike("exam_name", req.exam_name)
            .order("order_index")
            .execute()
        )
    
    questions = q_resp.data or []

    # 4. Randomized Shuffle
    if not question_order and exam.get("shuffle_questions"):
        seed = int(hashlib.md5(f"{session_id}{user_id}".encode()).hexdigest(), 16) % (2**31)
        rng = random.Random(seed)
        rng.shuffle(questions)
        question_order = [str(q["id"]) for q in questions]
        
        # Save order to session metadata
        try:
            curr_metadata = ins.data[0]["metadata"] if not existing.data else existing.data["metadata"]
            sb.table("quiz_sessions").update({
                "metadata": {**curr_metadata, "question_order": question_order}
            }).eq("id", session_id).execute()
        except Exception: pass

    return {
        "session_id": str(session_id),
        "expires_at": expires_at.isoformat(),
        "exam_config": {
            "title": exam.get("exam_title"),
            "duration_minutes": exam.get("duration_minutes", 20),
            "shuffle_questions": exam.get("shuffle_questions", False),
            "enable_face_proctoring": exam.get("enable_face_proctoring", False),
        },
        "question_order": question_order,
        "question_list_minimal": questions,
    }


# ── /api/final_submit ────────────────────────────────────────────────────────

class FinalResponse(BaseModel):
    question_id: str
    answer_json: dict
    updated_at: Optional[str] = None

class FinalSubmitRequest(BaseModel):
    session_id: str
    final_responses: List[FinalResponse] = Field(default_factory=list)
    client_ts: Optional[int] = None

@router.post("/final_submit")
async def final_submit(req: FinalSubmitRequest, user=Depends(get_current_student)):
    sb = get_supabase()
    user_id = user.get("id")
    now = datetime.now(timezone.utc)

    # 1. Verify Session
    session = (
        sb.table("quiz_sessions")
        .select("*")
        .eq("id", req.session_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.data.get("status") == "SUBMITTED":
        return {"status": "ok", "message": "Already submitted"}

    # 2. Bulk Insert Final Responses
    if req.final_responses:
        rows = [
            {
                "session_id": req.session_id,
                "question_id": r.question_id,
                "answer_json": r.answer_json,
                "updated_at": r.updated_at or now.isoformat(),
            }
            for r in req.final_responses
        ]
        try:
            sb.table("quiz_responses").upsert(rows, on_conflict="session_id,question_id").execute()
        except Exception as e:
            print(f"[SESSIONS] Response upsert error: {e}")

    # 3. Mark Session Completed
    sb.table("quiz_sessions").update({
        "status": "SUBMITTED",
        "completed_at": now.isoformat(),
    }).eq("id", req.session_id).execute()

    # Log session submit telemetry
    try:
        sb.table("quiz_telemetry").insert({
            "session_id": req.session_id,
            "event_type": "SESSION_SUBMIT",
            "payload": {"client_ts": req.client_ts, "responses_count": len(req.final_responses)},
            "created_at": now.isoformat()
        }).execute()
    except Exception: pass

    # 4. Legacy Compatibility (exam_results)
    # Still sync to exam_results for the older dashboard views until they are updated
    try:
        consolidated = {r.question_id: (r.answer_json.get("value") or r.answer_json) for r in req.final_responses}
        sb.table("exam_results").upsert({
            "student_id": str(user_id),
            "exam_title": session.data.get("metadata", {}).get("exam_name", "Unknown"),
            "answers": consolidated,
            "submitted_at": now.isoformat(),
            "category": session.data.get("category", "Others")
        }, on_conflict="student_id,exam_title").execute()
    except Exception: pass

    return {"status": "accepted", "message": "Submitted successfully"}


# ── /api/export_session ──────────────────────────────────────────────────────

@router.get("/export_session")
async def export_session(session_id: str, user=Depends(get_current_student)):
    _require_admin(user)
    sb = get_supabase()

    session = (
        sb.table("quiz_sessions")
        .select("*")
        .eq("id", session_id)
        .maybe_single()
        .execute()
    )
    if not session.data:
        raise HTTPException(status_code=404, detail="Session not found")

    responses  = sb.table("quiz_responses").select("*").eq("session_id", session_id).execute()
    telemetry  = sb.table("quiz_telemetry").select("id,event_type,payload,created_at").eq("session_id", session_id).order("created_at").execute()

    snapshot = {
        "session":    session.data,
        "responses":  responses.data or [],
        "telemetry":  telemetry.data or [],
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }
    return JSONResponse(
        content=snapshot,
        headers={"Content-Disposition": f'attachment; filename="session_{session_id[:8]}.json"'},
    )
