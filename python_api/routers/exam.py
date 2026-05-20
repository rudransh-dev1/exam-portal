from fastapi.responses import Response
from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from datetime import datetime, timezone
import json

from core.question_cache import (
    get_cached_questions, set_cached_questions,
    get_cached_config, set_cached_config, invalidate_all
)
from models.schemas import (
    QuestionsResponse, QuestionOut, TestCaseOut,
    SaveAnswerRequest, SaveAnswerResponse,
    BatchSaveRequest, BatchSaveResponse,
    SubmitExamRequest, SubmitExamResponse,
    StartExamResponse,
    BatchEventsRequest, BatchEventsResponse,
    CodeSubmitRequest, CodeSubmitResponse,
    UnifiedSyncRequest, UnifiedSyncResponse, ExamConfig, StudentStatus, PulseRequest
)
from core.redis_client import get_redis
from core.security import get_current_student
from db.supabase_client import get_supabase

router = APIRouter(prefix="/exam", tags=["exam"])

# ── Dynamic table existence check (cached at process level) ────────────────
_quiz_sessions_exists: bool | None = None

def _check_quiz_sessions_exists() -> bool:
    """Test if quiz_sessions table is available in Supabase.
    Result is cached for the lifetime of the process to avoid repeated probes."""
    global _quiz_sessions_exists
    if _quiz_sessions_exists is not None:
        return _quiz_sessions_exists
    db = get_supabase()
    try:
        db.table("quiz_sessions").select("id").limit(1).execute()
        _quiz_sessions_exists = True
        print("[EXAM] quiz_sessions table detected — using modern session path.")
    except Exception as e:
        err_str = str(e)
        if "PGRST205" in err_str or "Could not find" in err_str or "relation" in err_str:
            _quiz_sessions_exists = False
            print(f"[EXAM] quiz_sessions table NOT found — using legacy fallback. ({e})")
        else:
            # Transient error (network etc.) — don't cache, try again next time
            print(f"[EXAM] Transient error probing quiz_sessions: {e}")
            return False
    return _quiz_sessions_exists


def _check_exam_active(title: str):
    """Raises 423 if the exam has been deactivated by admin.
    Uses a 60-second cache to avoid hitting DB on every student request."""
    cached = get_cached_config(title)
    if cached is not None:
        row = cached
    else:
        db = get_supabase()
        try:
            result = db.table("exam_config").select("is_active, scheduled_start").eq("exam_title", title).limit(1).execute()
            row = result.data[0] if result.data else {}
            set_cached_config(title, row)
        except HTTPException:
            raise
        except Exception:
            return  # If table doesn't exist yet, default to active

    try:
        if not row.get("is_active", True):
            raise HTTPException(status_code=423, detail="exam_inactive")
        scheduled = row.get("scheduled_start")
        if scheduled:
            start_dt = datetime.fromisoformat(scheduled.replace("Z", "+00:00"))
            if start_dt > datetime.now(timezone.utc):
                raise HTTPException(status_code=425, detail=f"exam_scheduled:{scheduled}")
    except HTTPException:
        raise
    except Exception:
        pass


def update_last_active(student_id: str):
    """Background task to update student's last active timestamp."""
    # 1. Update Redis (High frequency, ephemeral)
    redis = get_redis()
    if redis:
        try:
            redis.set(f"active:{student_id}", "true", ex=60)
        except Exception:
            pass

    # 2. Update Supabase (Persisted, less frequent is fine but keeping it for now)
    db = get_supabase()
    db.table("exam_status").update(
        {"last_active": datetime.now(timezone.utc).isoformat()}
    ).eq("student_id", student_id).execute()
@router.get("/status")
def get_exam_status(title: str = None, current: dict = Depends(get_current_student)):
    """
    Returns the current student's exam session status for a specific exam.
    """
    db = get_supabase()
    student_id = current["student_id"]
    try:
        query = db.table("exam_status").select("*").eq("student_id", student_id)
        if title:
            query = query.eq("exam_title", title)
        result = query.execute()
        return {"data": result.data or []}
    except Exception as e:
        print(f"[EXAM] Status fetch error: {e}")
        return {"data": []}


@router.get("/history")
def get_exam_history(category: str = None, current: dict = Depends(get_current_student)):
    """
    Returns the student's past exam results.
    Supports optional category filtering (Aptitude, Programming, Events).
    """
    db = get_supabase()
    student_id = current["student_id"]
    user_id = current.get("user_id")
    
    results = []
    try:
        # 1. Try fetching from new quiz_sessions table if it exists
        query = db.table("quiz_sessions").select("*, exams(title)").eq("user_id", user_id).order("completed_at", desc=True)
        if category:
            query = query.eq("category", category)
        
        session_res = query.execute()
        for session in (session_res.data or []):
            results.append({
                "id": session["id"],
                "exam_title": session.get("exams", {}).get("title") or "Unknown Exam",
                "score": session["score"],
                "total_marks": session["total_marks"],
                "percentage": round(session["score"] / session["total_marks"] * 100, 1) if session["total_marks"] else 0,
                "submitted_at": session["completed_at"],
                "category": session["category"],
                "status": session["status"]
            })
            
    except Exception as e:
        print(f"[EXAM] quiz_sessions fetch failed (likely migration pending): {e}")

    # 2. Fetch from legacy exam_results (merging or fallback)
    try:
        legacy_query = db.table("exam_results").select("*").eq("student_id", student_id).order("submitted_at", desc=True)
        if category:
            legacy_query = legacy_query.eq("category", category)
        
        legacy_res = legacy_query.execute()
        # Only add legacy results if they aren't already represented by a new session
        # (Simple heuristic: check by title + time if needed, but for now just append)
        existing_titles = {r["exam_title"] for r in results}
        for r in (legacy_res.data or []):
            if r["exam_title"] not in existing_titles:
                results.append(r)
                
    except Exception as e:
        print(f"[EXAM] Legacy history fetch error: {e}")

    return {"results": results}


@router.delete("/history/{result_id}")
def delete_exam_result(result_id: str, current: dict = Depends(get_current_student)):
    """Delete a student's own exam result by ID."""
    db = get_supabase()
    student_id = current["student_id"]
    try:
        # Ensure student can only delete their own result
        check = db.table("exam_results").select("id").eq("id", result_id).eq("student_id", student_id).execute()
        if not check.data:
            raise HTTPException(status_code=404, detail="Result not found or not yours")
        db.table("exam_results").delete().eq("id", result_id).eq("student_id", student_id).execute()
        return {"success": True, "deleted_id": result_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── In-flight deduplication: only 1 DB fetch per exam at a time ─────────────
_fetch_locks: dict = {}
_fetch_lock_guard = __import__("threading").Lock()

def _get_fetch_lock(key: str) -> __import__("threading").Lock:
    with _fetch_lock_guard:
        if key not in _fetch_locks:
            _fetch_locks[key] = __import__("threading").Lock()
        return _fetch_locks[key]


def _fetch_questions_from_db(title: str, branch: str) -> list:
    """
    Fetch + filter questions from Supabase.
    Called AT MOST ONCE per (title, branch) per 5 minutes.
    All other concurrent calls wait on the same lock and use the cached result.
    """
    db = get_supabase()
    result = (
        db.table("questions")
        .select("id, text, options, branch, order_index, marks, exam_name, image_url, audio_url, question_type, category")
        .order("order_index")
        .limit(500)
        .execute()
    )
    all_questions = result.data or []
    print(f"[EXAM] DB fetched {len(all_questions)} total questions.")

    student_branch_upper = branch.strip().upper()
    title_norm = title.strip().lower()

    def exam_matches(q: dict) -> bool:
        q_exam = q.get("exam_name") or ""
        text = q.get("text", "")
        if text.startswith("⟦EXAM:"):
            idx = text.find("⟧")
            if idx != -1:
                q_exam = text[6:idx].strip()
        qe = q_exam.strip().lower()
        return (qe == title_norm
                or qe.replace(" ", "") == title_norm.replace(" ", "")
                or title_norm in qe or qe in title_norm)

    def branch_matches(q: dict) -> bool:
        qb = (q.get("branch") or "").strip().upper()
        if not qb:
            return True
        return (student_branch_upper == qb
                or student_branch_upper in qb
                or qb in student_branch_upper)

    filtered = [q for q in all_questions if exam_matches(q) and branch_matches(q)]

    # Fallback: branch-agnostic if nothing matched
    if not filtered:
        print(f"[EXAM] Branch fallback for title='{title}' branch='{branch}'")
        filtered = [q for q in all_questions if exam_matches(q)]

    # Attach code_questions data (DISABLED)
    # code_q_ids = [q["id"] for q in filtered if q.get("question_type") == "code"]
    code_q_map: dict = {}
    # if code_q_ids:
    #     try:
    #         cq_result = db.table("code_questions").select("*").in_("question_id", code_q_ids).execute()
    #         for cq in (cq_result.data or []):
    #             code_q_map[cq["question_id"]] = cq
    #     except Exception as e:
    #         print(f"[EXAM] code_questions fetch error: {e}")

    questions = []
    for q in filtered:
        qtype = q.get("question_type", "mcq")
        cq = code_q_map.get(q["id"]) if qtype == "code" else None
        test_cases = None
        starter_code = None
        if cq:
            starter_code = cq.get("starter_code", "")
            raw_tests = cq.get("test_cases") or []
            test_cases = [TestCaseOut(**t) for t in raw_tests]
        questions.append(QuestionOut(
            id=q["id"],
            text=q["text"].replace(f"⟦EXAM:{title}⟧", "").strip(),
            options=q["options"] if qtype == "mcq" else [],
            branch=q.get("branch", branch),
            order_index=q["order_index"],
            marks=q["marks"],
            image_url=q.get("image_url"),
            audio_url=q.get("audio_url"),
            question_type=qtype,
            starter_code=starter_code,
            test_cases=test_cases,
        ))

    print(f"[EXAM] Cached {len(questions)} questions for title='{title}' branch='{branch}'")
    return questions


@router.get("/questions", response_model=QuestionsResponse)
def get_questions(
    title: str,
    background_tasks: BackgroundTasks,
    response: Response,
    current: dict = Depends(get_current_student)
):
    """
    Return questions for a specific exam. 
    Server-side TTL cache (5 min) + in-flight deduplication ensures
    100 concurrent students generate exactly 1 DB query.
    """
    _check_exam_active(title)

    # Tell the browser to cache the response privately for 30 min
    response.headers["Cache-Control"] = "private, max-age=1800, stale-while-revalidate=600"

    # Update last_active in background (non-blocking)
    background_tasks.add_task(update_last_active, current["student_id"])

    branch = current.get("branch", "CS")

    # ── 1. Try in-process cache first ──────────────────────────────────────
    cached = get_cached_questions(title, branch)
    if cached is not None:
        print(f"[EXAM] Cache HIT for title='{title}' branch='{branch}' ({len(cached)} qs)")
        return QuestionsResponse(questions=cached, total=len(cached))

    # ── 2. Only ONE thread fetches from DB; others wait on the same lock ───
    lock_key = f"{title.strip().lower()}::{branch.strip().upper()}"
    fetch_lock = _get_fetch_lock(lock_key)

    with fetch_lock:
        # Double-check after acquiring lock (another thread may have populated cache)
        cached = get_cached_questions(title, branch)
        if cached is not None:
            print(f"[EXAM] Cache HIT (post-lock) for title='{title}' branch='{branch}'")
            return QuestionsResponse(questions=cached, total=len(cached))

        # ── 3. Actual DB fetch ────────────────────────────────────────────
        try:
            questions = _fetch_questions_from_db(title, branch)
        except Exception as e:
            import traceback; traceback.print_exc()
            print(f"[EXAM] CRITICAL DB Error: {e}")
            return QuestionsResponse(questions=[], total=0)

        is_fallback = len(questions) == 0
        set_cached_questions(title, branch, questions, is_fallback=is_fallback)
        return QuestionsResponse(questions=questions, total=len(questions))

@router.get("/test-branch")
def test_branch(branch: str):
    db = get_supabase()
    try:
        result = (
            db.table("questions")
            .select("id, text, options, branch, order_index, marks, exam_name, image_url")
            .ilike("branch", f"%{branch}%")
            .order("order_index")
            .limit(100)
            .execute()
        )
        return {"success": True, "data": result.data}
    except Exception as e:
        return {"success": False, "error": str(e), "type": str(type(e))}


@router.post("/save-answer", response_model=SaveAnswerResponse)
def save_answer(
    request: SaveAnswerRequest,
    background_tasks: BackgroundTasks,
    current: dict = Depends(get_current_student),
):
    """
    Upsert a single answer for (student_id, question_id).
    Also updates last_active in background. Used by auto-save every 15s.
    """
    db = get_supabase()
    student_id = current["student_id"]

    # Guard: reject if already submitted
    status_row = (
        db.table("exam_status")
        .select("status")
        .eq("student_id", student_id)
        .single()
        .execute()
    )
    if status_row.data and status_row.data["status"] == "submitted":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Exam already submitted. Cannot save answers.",
        )

    # Fetch existing answers
    existing = (
        db.table("exam_results")
        .select("answers")
        .eq("student_id", student_id)
        .execute()
    )

    if existing.data:
        answers = existing.data[0].get("answers") or {}
        answers[request.question_id] = request.selected_option
        db.table("exam_results").update({"answers": answers}).eq(
            "student_id", student_id
        ).execute()
    else:
        db.table("exam_results").insert(
            {
                "student_id": student_id,
                "answers": {request.question_id: request.selected_option},
                "score": 0,
            }
        ).execute()

    # Update last_active in background
    background_tasks.add_task(update_last_active, student_id)

    return SaveAnswerResponse(saved=True, question_id=request.question_id)


@router.post("/submit-exam", response_model=SubmitExamResponse)
def submit_exam(
    request: SubmitExamRequest,
    current: dict = Depends(get_current_student),
):
    """
    Finalize the exam:
    1. Reject if already submitted (idempotent safety)
    2. Calculate score against correct answers
    3. Save final answers + score (quiz_sessions if available, else exam_results)
    4. Mark status as SUBMITTED
    5. Clear active session
    """
    db = get_supabase()
    student_id = current["student_id"]
    user_id = current.get("user_id")
    use_modern = _check_quiz_sessions_exists()

    # 1. Load correct answers ONLY for the question IDs the student was served
    answers = request.answers
    exam_title = answers.pop("__exam_title", "Initial Assessment")

    # Get exam info
    exam_res = db.table("exam_config").select("id, category").eq("exam_title", exam_title).limit(1).execute()
    if not exam_res.data:
        raise HTTPException(status_code=404, detail="Exam configuration not found")
    
    exam_info = exam_res.data[0]
    exam_id = exam_info["id"]
    category = exam_info.get("category", "Others")

    # 1b. Guard: already submitted this SPECIFIC exam?
    session_data = {}
    if use_modern:
        try:
            session_res = db.table("quiz_sessions").select("id, status").eq("user_id", user_id).eq("exam_id", exam_id).limit(1).execute()
            session_data = session_res.data[0] if session_res.data else {}
        except Exception as e:
            print(f"[EXAM] quiz_sessions guard check failed, using legacy: {e}")
            use_modern = False

    if use_modern and session_data.get("status") == "SUBMITTED":
        # Return existing result from modern table
        try:
            result_row = db.table("quiz_sessions").select("score, total_marks, completed_at, metadata").eq("id", session_data["id"]).single().execute()
            r = result_row.data or {}
            total = r.get("total_marks", 0)
            sc = r.get("score", 0)
            meta = r.get("metadata", {})
            return SubmitExamResponse(
                submitted=True,
                score=sc,
                total_marks=total,
                correct_count=meta.get("correct_count", 0),
                wrong_count=meta.get("wrong_count", 0),
                percentage=round(sc / total * 100, 1) if total else 0,
                submitted_at=r.get("completed_at", datetime.now(timezone.utc).isoformat()),
            )
        except Exception as e:
            print(f"[EXAM] Modern submit guard fetch failed: {e}")

    # Legacy guard: check exam_results for already-submitted
    if not use_modern:
        try:
            legacy_check = db.table("exam_results").select("score, total_marks, correct_count, wrong_count, submitted_at").eq("student_id", student_id).eq("exam_title", exam_title).limit(1).execute()
            if legacy_check.data and legacy_check.data[0].get("submitted_at"):
                r = legacy_check.data[0]
                total = r.get("total_marks", 0)
                sc = r.get("score", 0)
                return SubmitExamResponse(
                    submitted=True,
                    score=sc,
                    total_marks=total,
                    correct_count=r.get("correct_count", 0),
                    wrong_count=r.get("wrong_count", 0),
                    percentage=round(sc / total * 100, 1) if total else 0,
                    submitted_at=r.get("submitted_at", datetime.now(timezone.utc).isoformat()),
                )
        except Exception as e:
            print(f"[EXAM] Legacy submit guard check failed: {e}")

    # 2. Calculate score
    submitted_ids = [k for k in answers.keys() if not k.startswith("__")]
    questions_result = db.table("questions").select("id, correct_answer, marks").in_("id", submitted_ids).execute()
    correct_map = {q["id"]: (q["correct_answer"], q["marks"]) for q in (questions_result.data or [])}

    score = 0
    correct_count = 0
    wrong_count = 0
    total_marks = sum(marks for _, marks in correct_map.values())

    responses_payload = []
    for q_id, selected in answers.items():
        if q_id in correct_map:
            correct_ans, marks = correct_map[q_id]
            is_correct = (selected == correct_ans)
            marks_obtained = marks if is_correct else 0
            if is_correct:
                score += marks
                correct_count += 1
            else:
                wrong_count += 1
            
            responses_payload.append({
                "session_id": session_data.get("id"),
                "question_id": q_id,
                "answer_json": {"selected": selected},
                "is_correct": is_correct,
                "marks_obtained": marks_obtained
            })

    completed_at = datetime.now(timezone.utc).isoformat()

    # 3. Update quiz_sessions (modern path)
    if use_modern and session_data.get("id"):
        try:
            db.table("quiz_sessions").update({
                "status": "SUBMITTED",
                "completed_at": completed_at,
                "score": score,
                "total_marks": total_marks,
                "metadata": {
                    "correct_count": correct_count,
                    "wrong_count": wrong_count,
                    "total_questions": len(correct_map)
                }
            }).eq("id", session_data["id"]).execute()
        except Exception as e:
            print(f"[EXAM] quiz_sessions update failed: {e}")

        # Insert quiz_responses (modern path)
        if responses_payload:
            try:
                db.table("quiz_responses").upsert(responses_payload).execute()
            except Exception as e:
                print(f"[EXAM] quiz_responses upsert failed: {e}")

    # 4. Legacy: Cleanup active session
    try:
        db.table("exam_status").delete().eq("student_id", student_id).execute()
    except Exception as e:
        print(f"[EXAM] exam_status cleanup failed: {e}")
    try:
        db.table("students").update({"is_active_session": False, "current_token": None}).eq("id", student_id).execute()
    except Exception as e:
        print(f"[EXAM] students update failed: {e}")

    # 5. Always write to legacy exam_results (guaranteed to exist)
    try:
        db.table("exam_results").upsert({
            "student_id": student_id, 
            "exam_title": exam_title, 
            "answers": answers, 
            "score": score, 
            "total_marks": total_marks,
            "correct_count": correct_count,
            "wrong_count": wrong_count,
            "total_questions": len(correct_map),
            "submitted_at": completed_at,
            "category": category
        }).execute()
    except Exception as e:
        print(f"[EXAM] exam_results upsert failed: {e}")

    return SubmitExamResponse(
        submitted=True,
        score=score,
        total_marks=total_marks,
        correct_count=correct_count,
        wrong_count=wrong_count,
        percentage=round(score / total_marks * 100, 1) if total_marks else 0,
        submitted_at=completed_at,
    )


@router.post("/start-exam", response_model=StartExamResponse)
async def start_exam(
    title: str,
    current: dict = Depends(get_current_student)
):
    """
    Officially starts the exam timer for the student.
    Dynamically uses quiz_sessions if available, otherwise falls back
    to exam_status (legacy) for session management.
    """
    _check_exam_active(title)
    db = get_supabase()
    student_id = current["student_id"]
    user_id = current.get("user_id")
    use_modern = _check_quiz_sessions_exists()

    # Fetch exam config to get category and id
    exam_res = db.table("exam_config").select("id, category").eq("exam_title", title).limit(1).execute()
    if not exam_res.data:
        raise HTTPException(status_code=404, detail="Exam configuration not found")
    
    exam_info = exam_res.data[0]
    exam_id = exam_info["id"]
    category = exam_info.get("category", "Others")

    started_at = datetime.now(timezone.utc).isoformat()
    session_id = None

    # ── Modern path: quiz_sessions ─────────────────────────────────────────
    if use_modern:
        try:
            session_res = db.table("quiz_sessions").select("*").eq("user_id", user_id).eq("exam_id", exam_id).limit(1).execute()
            session_data = session_res.data[0] if session_res.data else {}

            if session_data.get("status") == "SUBMITTED":
                raise HTTPException(status_code=403, detail="Exam already submitted.")
            
            if session_data.get("status") == "TERMINATED":
                raise HTTPException(status_code=403, detail="Session terminated due to violations.")

            if session_data.get("status") == "ACTIVE" and session_data.get("started_at"):
                return StartExamResponse(
                    started_at=session_data["started_at"], 
                    status="active", started=True, 
                    exam_title=title,
                    session_id=session_data["id"],
                    category=category
                )

            if session_data:
                db.table("quiz_sessions").update({
                    "status": "ACTIVE", "started_at": started_at,
                }).eq("id", session_data["id"]).execute()
                session_id = session_data["id"]
            else:
                new_session = db.table("quiz_sessions").insert({
                    "user_id": user_id, "exam_id": exam_id,
                    "category": category, "status": "ACTIVE", 
                    "started_at": started_at,
                }).execute()
                session_id = new_session.data[0]["id"] if new_session.data else None
        except HTTPException:
            raise
        except Exception as e:
            print(f"[EXAM] Modern start_exam failed, falling back to legacy: {e}")
            use_modern = False  # fall through to legacy below

    # ── Legacy fallback: exam_status ───────────────────────────────────────
    if not use_modern:
        try:
            # Check if already submitted via exam_results
            submitted_check = db.table("exam_results").select("submitted_at").eq("student_id", student_id).eq("exam_title", title).limit(1).execute()
            if submitted_check.data and submitted_check.data[0].get("submitted_at"):
                raise HTTPException(status_code=403, detail="Exam already submitted.")
        except HTTPException:
            raise
        except Exception:
            pass  # Table might not have submitted_at column; proceed

        try:
            # Check if already active in exam_status
            status_check = db.table("exam_status").select("*").eq("student_id", student_id).eq("exam_title", title).limit(1).execute()
            if status_check.data:
                existing = status_check.data[0]
                if existing.get("status") == "active" and existing.get("started_at"):
                    return StartExamResponse(
                        started_at=existing["started_at"],
                        status="active", started=True,
                        exam_title=title,
                        session_id="legacy-session",
                        category=category
                    )
        except Exception as e:
            print(f"[EXAM] Legacy status check error: {e}")

        session_id = "legacy-session"

    # Always upsert exam_status for real-time monitoring (works for both paths)
    try:
        db.table("exam_status").upsert({
            "student_id": student_id,
            "status": "active", 
            "started_at": started_at, 
            "last_active": started_at,
            "warnings": 0,
            "exam_title": title
        }).execute()
    except Exception as e:
        print(f"[EXAM] exam_status upsert failed: {e}")

    return StartExamResponse(
        started_at=started_at, 
        status="active", 
        session_id=session_id,
        category=category,
        exam_title=title
    )


# ── NEW: Batch Save Answers ───────────────────────────────────


@router.post("/batch-save", response_model=BatchSaveResponse)
def batch_save_answers(
    request: BatchSaveRequest,
    background_tasks: BackgroundTasks,
    current: dict = Depends(get_current_student),
):
    """
    Batch upsert multiple answers in a single DB write.
    Replaces the per-answer save endpoint — one request per 30s instead of N.
    """
    db = get_supabase()
    student_id = current["student_id"]

    if not request.answers:
        return BatchSaveResponse(saved=True, count=0)

    # Guard: reject if already submitted
    status_row = db.table("exam_status").select("status").eq("student_id", student_id).single().execute()
    if status_row.data and status_row.data["status"] == "submitted":
        return BatchSaveResponse(saved=False, count=0)

    # Fetch existing answers and merge
    existing = db.table("exam_results").select("answers").eq("student_id", student_id).execute()
    if existing.data:
        merged = existing.data[0].get("answers") or {}
        merged.update(request.answers)
        db.table("exam_results").update({"answers": merged}).eq("student_id", student_id).execute()
    else:
        db.table("exam_results").insert({
            "student_id": student_id,
            "answers": request.answers,
            "score": 0,
        }).execute()

    background_tasks.add_task(update_last_active, student_id)
    return BatchSaveResponse(saved=True, count=len(request.answers))


# ── NEW: Batch Telemetry Events ───────────────────────────────

@router.post("/batch-events", response_model=BatchEventsResponse)
def batch_events(
    request: BatchEventsRequest,
    current: dict = Depends(get_current_student),
):
    """
    Accept a batch of telemetry events from the client queue.
    Inserts all events as a single row (append-only log).
    """
    db = get_supabase()
    student_id = current["student_id"]

    if not request.events:
        return BatchEventsResponse(received=0)

    events_data = [e.model_dump() for e in request.events]
    try:
        db.table("telemetry_batches").insert({
            "student_id": student_id,
            "events": events_data,
        }).execute()
    except Exception as e:
        print(f"[TELEMETRY] Batch insert error: {e}")

    return BatchEventsResponse(received=len(request.events))



# ── Unified Sync (Consolidated API) ───────────────────────────

@router.post("/sync-all", response_model=UnifiedSyncResponse)
def unified_sync(
    request: UnifiedSyncRequest,
    background_tasks: BackgroundTasks,
    current: dict = Depends(get_current_student),
):
    """
    The Master Sync Endpoint:
    1. Consolidates multiple dirty answer saves into one DB update.
    2. Batches telemetry events.
    3. Returns the LATEST exam configuration (active status, duration, etc.).
    4. Returns the LATEST student status (warning count, terminated status).
    
    Projected load reduction: 80-90% fewer API calls.
    """
    db = get_supabase()
    student_id = current["student_id"]
    user_id = current.get("user_id")
    exam_title = request.exam_title or current.get("exam_title", "Assessment")

    # 1. Handle Responses (Autosave)
    if request.responses:
        # Check if already submitted (idempotent guard)
        # Note: We fetch from exam_status for real-time status
        status_check = db.table("exam_status").select("status").eq("student_id", student_id).maybeSingle().execute()
        if not (status_check.data and status_check.data["status"] == "submitted"):
            # Merge with existing answers in exam_results
            existing = db.table("exam_results").select("answers").eq("student_id", student_id).execute()
            new_answers = {r.question_id: r.answer_json.get("selected") for r in request.responses}
            if existing.data:
                merged = existing.data[0].get("answers") or {}
                merged.update(new_answers)
                db.table("exam_results").update({"answers": merged}).eq("student_id", student_id).execute()
            else:
                db.table("exam_results").insert({
                    "student_id": student_id,
                    "answers": new_answers,
                    "score": 0,
                    "exam_title": exam_title
                }).execute()

    # 2. Handle Events (Telemetry)
    if request.events:
        events_data = [e.model_dump() for e in request.events]
        try:
            db.table("telemetry_batches").insert({
                "student_id": student_id,
                "events": events_data,
            }).execute()
        except Exception as e:
            print(f"[SYNC] Telemetry error: {e}")

    # 3. Handle Code Submissions
    if request.code_submissions:
        for cs in request.code_submissions:
            try:
                results_data = [r.model_dump() for r in cs.test_results]
                payload = {
                    "student_id": student_id,
                    "question_id": cs.question_id,
                    "code": cs.code,
                    "language": cs.language,
                    "test_results": results_data,
                    "passed_count": cs.passed_count,
                    "total_count": cs.total_count,
                    "is_final": cs.is_final,
                    "submitted_at": cs.submitted_at,
                }
                # Upsert into code_submissions
                existing_code = db.table("code_submissions").select("id").eq("student_id", student_id).eq("question_id", cs.question_id).execute()
                if existing_code.data:
                    db.table("code_submissions").update(payload).eq("student_id", student_id).eq("question_id", cs.question_id).execute()
                else:
                    db.table("code_submissions").insert(payload).execute()
            except Exception as e:
                print(f"[SYNC] Code submission error for {cs.question_id}: {e}")

    # 4. Fetch LATEST Config (Cached for 60s)
    config_data = None
    cached_cfg = get_cached_config(exam_title)
    if cached_cfg:
        config_data = ExamConfig(**cached_cfg)
    else:
        cfg_res = db.table("exam_config").select("*").eq("exam_title", exam_title).maybeSingle().execute()
        if cfg_res.data:
            config_data = ExamConfig(**cfg_res.data)
            set_cached_config(exam_title, cfg_res.data)

    # 4. Fetch Student Status (Real-time lookup)
    status_data = None
    stat_res = db.table("exam_status").select("*").eq("student_id", student_id).maybeSingle().execute()
    if stat_res.data:
        status_data = StudentStatus(**stat_res.data)

    # Background task for heartbeat
    background_tasks.add_task(update_last_active, student_id)

    return UnifiedSyncResponse(
        success=True,
        sync_ts=int(datetime.now(timezone.utc).timestamp() * 1000),
        config=config_data,
        status=status_data
    )


@router.post("/pulse")
def student_pulse(
    request: PulseRequest,
    current: dict = Depends(get_current_student)
):
    """
    High-frequency heartbeat (every 10s).
    Offloads Supabase by using Upstash Redis for ephemeral status.
    Returns termination flag if admin has banned the student.
    """
    redis = get_redis()
    student_id = current["student_id"]
    
    # 1. Update heartbeat in Redis (expires in 30s)
    if redis:
        try:
            key = f"pulse:{student_id}"
            payload = {
                "ts": request.ts,
                "q": request.current_question_id or "na",
                "exam": request.exam_title or "na"
            }
            redis.set(key, json.dumps(payload), ex=30)
            
            # 2. Check for termination flag in Redis
            # Admins will set "terminate:{student_id}" = "true" to force logout
            is_terminated = redis.get(f"terminate:{student_id}")
            if is_terminated == "true":
                return {"terminate": True, "status": "terminated"}
                
        except Exception as e:
            print(f"[REDIS] Pulse error: {e}")

    # Fallback/Supplemental: Return student status (cached config if needed)
    # We don't hit Supabase here unless we absolutely have to for status updates.
    # For now, just return success.
    return {"status": "ok", "terminate": False}


# ── DEPRECATED: Consolidated into /sync-all ──────────────────

# @router.post("/save-answer", response_model=SaveAnswerResponse)
# ...
# @router.post("/batch-save", response_model=BatchSaveResponse)
# ...
# @router.post("/batch-events", response_model=BatchEventsResponse)
# ...

# ── NEW: Submit Code Answer (Pyodide result) ──────────────────

# @router.post("/submit-code", response_model=CodeSubmitResponse)
# def submit_code(
#     request: CodeSubmitRequest,
#     background_tasks: BackgroundTasks,
#     current: dict = Depends(get_current_student),
# ):
#     """
#     Upsert Pyodide code execution result for a question.
#     Stores the student's code + test results in code_submissions table.
#     """
#     db = get_supabase()
#     student_id = current["student_id"]
#
#     # Guard: reject if already submitted AND is_final
#     if request.is_final:
#         status_row = db.table("exam_status").select("status").eq("student_id", student_id).single().execute()
#         if status_row.data and status_row.data["status"] == "submitted":
#             return CodeSubmitResponse(
#                 saved=False,
#                 question_id=request.question_id,
#                 passed_count=request.passed_count,
#                 total_count=request.total_count,
#             )
#
#     results_data = [r.model_dump() for r in request.test_results]
#
#     try:
#         # Try upsert (unique on student_id + question_id)
#         existing = (
#             db.table("code_submissions")
#             .select("id")
#             .eq("student_id", student_id)
#             .eq("question_id", request.question_id)
#             .execute()
#         )
#         from datetime import datetime, timezone
#         now = datetime.now(timezone.utc).isoformat()
#         payload = {
#             "student_id": student_id,
#             "question_id": request.question_id,
#             "code": request.code,
#             "language": "python",
#             "test_results": results_data,
#             "passed_count": request.passed_count,
#             "total_count": request.total_count,
#             "is_final": request.is_final,
#             "submitted_at": now,
#         }
#         if existing.data:
#             db.table("code_submissions").update(payload).eq("student_id", student_id).eq("question_id", request.question_id).execute()
#         else:
#             db.table("code_submissions").insert(payload).execute()
#     except Exception as e:
#         print(f"[CODE] Submit error: {e}")
#
#     background_tasks.add_task(update_last_active, student_id)
#
#     return CodeSubmitResponse(
#         saved=True,
#         question_id=request.question_id,
#         passed_count=request.passed_count,
#         total_count=request.total_count,
#     )



