"""
Events API — CRUD for events and event rounds.
Admin creates/manages events; faculty can also create events.
Students view active events on their dashboard.
"""
import os, json
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from db.supabase_client import get_supabase

router = APIRouter(tags=["events"])

ADMIN_SECRET = os.getenv("NEXT_PUBLIC_ADMIN_SECRET", os.getenv("ADMIN_SECRET", "rudranshsarvam"))

def _check_admin(request: Request):
    secret = request.headers.get("x-admin-secret", "")
    if secret != ADMIN_SECRET:
        raise HTTPException(403, "Admin access required")

# ── Models ──────────────────────────────────────────────────────

class CreateEventRequest(BaseModel):
    name: str
    description: str = ""
    created_by: str = "admin"
    created_by_name: str = "Admin"

class UpdateEventRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class CreateRoundRequest(BaseModel):
    round_number: int = 1
    round_type: str  # 'mcq', 'programming', 'jumble'
    title: str = "Untitled Round"
    config_json: dict = {}

class UpdateRoundRequest(BaseModel):
    round_number: Optional[int] = None
    round_type: Optional[str] = None
    title: Optional[str] = None
    config_json: Optional[dict] = None

# ── Event CRUD ──────────────────────────────────────────────────

@router.post("/admin/events")
async def create_event(req: CreateEventRequest, request: Request):
    _check_admin(request)
    db = get_supabase()
    try:
        result = db.table("events").insert({
            "name": req.name.strip(),
            "description": req.description,
            "created_by": req.created_by,
            "created_by_name": req.created_by_name,
            "is_active": True,
        }).execute()
        if not result.data:
            raise HTTPException(500, "Failed to create event")
        return {"ok": True, "event": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

@router.get("/admin/events")
async def list_events(request: Request):
    _check_admin(request)
    db = get_supabase()
    try:
        result = db.table("events").select("*").order("created_at", desc=True).execute()
        events = result.data or []
        # Attach round count for each event
        for ev in events:
            rounds_res = db.table("event_rounds").select("id", count="exact").eq("event_id", ev["id"]).execute()
            ev["round_count"] = rounds_res.count or 0
        return events
    except Exception as e:
        raise HTTPException(500, str(e))

@router.get("/admin/events/{event_id}")
async def get_event(event_id: str, request: Request):
    _check_admin(request)
    db = get_supabase()
    try:
        ev_res = db.table("events").select("*").eq("id", event_id).maybe_single().execute()
        if not ev_res.data:
            raise HTTPException(404, "Event not found")
        event = ev_res.data
        rounds_res = db.table("event_rounds").select("*").eq("event_id", event_id).order("round_number").execute()
        event["rounds"] = rounds_res.data or []
        return event
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

@router.patch("/admin/events/{event_id}")
async def update_event(event_id: str, req: UpdateEventRequest, request: Request):
    _check_admin(request)
    db = get_supabase()
    updates = {k: v for k, v in req.dict().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        result = db.table("events").update(updates).eq("id", event_id).execute()
        return {"ok": True, "event": result.data[0] if result.data else None}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.delete("/admin/events/{event_id}")
async def delete_event(event_id: str, request: Request):
    _check_admin(request)
    db = get_supabase()
    try:
        # Delete rounds first (cascade may not work via client API)
        db.table("event_rounds").delete().eq("event_id", event_id).execute()
        db.table("events").delete().eq("id", event_id).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))

# ── Round CRUD ──────────────────────────────────────────────────

@router.post("/admin/events/{event_id}/rounds")
async def create_round(event_id: str, req: CreateRoundRequest, request: Request):
    _check_admin(request)
    db = get_supabase()
    try:
        # Get max round number
        existing = db.table("event_rounds").select("round_number").eq("event_id", event_id).order("round_number", desc=True).limit(1).execute()
        next_num = (existing.data[0]["round_number"] + 1) if existing.data else 1
        if req.round_number:
            next_num = req.round_number

        result = db.table("event_rounds").insert({
            "event_id": event_id,
            "round_number": next_num,
            "round_type": req.round_type,
            "title": req.title.strip(),
            "config_json": json.dumps(req.config_json) if isinstance(req.config_json, dict) else req.config_json,
        }).execute()
        if not result.data:
            raise HTTPException(500, "Failed to create round")
        return {"ok": True, "round": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

@router.patch("/admin/events/{event_id}/rounds/{round_id}")
async def update_round(event_id: str, round_id: str, req: UpdateRoundRequest, request: Request):
    _check_admin(request)
    db = get_supabase()
    updates = {}
    if req.round_number is not None:
        updates["round_number"] = req.round_number
    if req.round_type is not None:
        updates["round_type"] = req.round_type
    if req.title is not None:
        updates["title"] = req.title
    if req.config_json is not None:
        updates["config_json"] = json.dumps(req.config_json) if isinstance(req.config_json, dict) else req.config_json
    if not updates:
        raise HTTPException(400, "No fields to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        result = db.table("event_rounds").update(updates).eq("id", round_id).eq("event_id", event_id).execute()
        return {"ok": True, "round": result.data[0] if result.data else None}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.delete("/admin/events/{event_id}/rounds/{round_id}")
async def delete_round(event_id: str, round_id: str, request: Request):
    _check_admin(request)
    db = get_supabase()
    try:
        db.table("event_rounds").delete().eq("id", round_id).eq("event_id", event_id).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))

# ── Public (Student) Endpoints ──────────────────────────────────

@router.get("/events/active")
async def get_active_events():
    """Students can see active events on their dashboard."""
    db = get_supabase()
    try:
        result = db.table("events").select("id, name, description, is_active, created_at, created_by_name").eq("is_active", True).order("created_at", desc=True).execute()
        events = result.data or []
        for ev in events:
            rounds_res = db.table("event_rounds").select("id, round_number, round_type, title, config_json").eq("event_id", ev["id"]).order("round_number").execute()
            ev["rounds"] = rounds_res.data or []
        return events
    except Exception as e:
        raise HTTPException(500, str(e))

@router.get("/events/history")
async def get_event_history():
    """Completed/inactive events for history section."""
    db = get_supabase()
    try:
        result = db.table("events").select("id, name, description, is_active, created_at, created_by_name, updated_at").eq("is_active", False).order("updated_at", desc=True).execute()
        return result.data or []
    except Exception as e:
        raise HTTPException(500, str(e))

class EventSubmitRequest(BaseModel):
    event_id: str
    student_id: str
    student_name: str
    student_usn: str
    score: float
    total_marks: float
    rounds_data: dict

@router.post("/events/submit")
async def submit_event_result(req: EventSubmitRequest):
    db = get_supabase()
    try:
        # Self-healing migration for event_submissions table
        try:
            db.table("event_submissions").select("id").limit(1).execute()
        except Exception:
            # Table doesn't exist, create it!
            try:
                from db.supabase_client import execute_sql
                create_sql = """
                CREATE TABLE IF NOT EXISTS event_submissions (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
                    student_id UUID NOT NULL,
                    student_name TEXT,
                    student_usn TEXT,
                    score NUMERIC DEFAULT 0,
                    total_marks NUMERIC DEFAULT 0,
                    rounds_data JSONB DEFAULT '{}'::jsonb,
                    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
                );
                """
                execute_sql(create_sql)
            except Exception as e:
                print(f"[EVENTS] Self-healing migration failed (maybe not administrative privileges): {e}")

        # Insert into event_submissions if possible
        submission_data = None
        try:
            sub_res = db.table("event_submissions").insert({
                "event_id": req.event_id,
                "student_id": req.student_id,
                "student_name": req.student_name,
                "student_usn": req.student_usn,
                "score": req.score,
                "total_marks": req.total_marks,
                "rounds_data": json.dumps(req.rounds_data) if isinstance(req.rounds_data, dict) else req.rounds_data
            }).execute()
            submission_data = sub_res.data[0] if sub_res.data else None
        except Exception as e:
            print(f"[EVENTS] Failed to insert into event_submissions: {e}")

        # Get event name to store in legacy history
        event_name = "Event Challenge"
        try:
            ev_info = db.table("events").select("name").eq("id", req.event_id).maybe_single().execute()
            if ev_info.data:
                event_name = ev_info.data.get("name", "Event Challenge")
        except Exception:
            pass

        # Also store in legacy exam_results so it shows up in history!
        try:
            db.table("exam_results").upsert({
                "student_id": req.student_id,
                "exam_title": f"Event: {event_name}",
                "answers": req.rounds_data,
                "score": req.score,
                "total_marks": req.total_marks,
                "submitted_at": datetime.now(timezone.utc).isoformat(),
                "category": "Events"
            }).execute()
        except Exception as e:
            print(f"[EVENTS] Failed to write legacy exam_results: {e}")
            
        return {"ok": True, "submission": submission_data}
    except Exception as e:
        raise HTTPException(500, str(e))

