import os
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import JWTError, jwt
from db.supabase_client import get_supabase, execute_sql

router = APIRouter(tags=["faculty"])

ADMIN_SECRET = os.getenv("NEXT_PUBLIC_ADMIN_SECRET", os.getenv("ADMIN_SECRET", "rudranshsarvam"))
SECRET_KEY = os.getenv("JWT_SECRET", "faculty_super_secret_key_123")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def _check_admin(request: Request):
    secret = request.headers.get("x-admin-secret", "")
    if secret != ADMIN_SECRET:
        raise HTTPException(403, "Admin access required")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# ── Self-Healing Migration ────────────────────────────────────────

def ensure_faculty_table():
    db = get_supabase()
    try:
        db.table("faculty").select("id").limit(1).execute()
    except Exception:
        try:
            create_sql = """
            CREATE TABLE IF NOT EXISTS faculty (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                department TEXT,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
            );
            """
            execute_sql(create_sql)
        except Exception as e:
            print(f"[FACULTY] Migration failed: {e}")
            
    # Try adding department column if it's missing from older installations
    try:
        execute_sql("ALTER TABLE faculty ADD COLUMN department TEXT;")
    except Exception:
        pass

# ── Models ──────────────────────────────────────────────────────

class FacultyCreate(BaseModel):
    email: str
    name: str
    department: str = ""
    password: str

class FacultyUpdate(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    password: Optional[str] = None

class FacultyLogin(BaseModel):
    email: str
    password: str

# ── Admin Endpoints ─────────────────────────────────────────────

@router.post("/admin/faculty")
async def create_faculty(req: FacultyCreate, request: Request):
    _check_admin(request)
    ensure_faculty_table()
    db = get_supabase()
    try:
        hashed_password = pwd_context.hash(req.password)
        result = db.table("faculty").insert({
            "email": req.email.strip().lower(),
            "name": req.name.strip(),
            "department": req.department.strip(),
            "password_hash": hashed_password
        }).execute()
        
        fac = result.data[0]
        del fac["password_hash"]
        return {"ok": True, "faculty": fac}
    except Exception as e:
        if "duplicate key" in str(e).lower() or "unique constraint" in str(e).lower():
            raise HTTPException(400, "Faculty with this email already exists")
        raise HTTPException(500, str(e))

@router.get("/admin/faculty")
async def list_faculty(request: Request):
    _check_admin(request)
    ensure_faculty_table()
    db = get_supabase()
    try:
        result = db.table("faculty").select("id, email, name, department, created_at").order("created_at", desc=True).execute()
        return result.data or []
    except Exception as e:
        raise HTTPException(500, str(e))

@router.delete("/admin/faculty/{faculty_id}")
async def delete_faculty(faculty_id: str, request: Request):
    _check_admin(request)
    ensure_faculty_table()
    db = get_supabase()
    try:
        db.table("faculty").delete().eq("id", faculty_id).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.patch("/admin/faculty/{faculty_id}")
async def update_faculty(faculty_id: str, req: FacultyUpdate, request: Request):
    _check_admin(request)
    ensure_faculty_table()
    db = get_supabase()
    updates = {}
    if req.name is not None:
        updates["name"] = req.name.strip()
    if req.department is not None:
        updates["department"] = req.department.strip()
    if req.password is not None and req.password.strip() != "":
        updates["password_hash"] = pwd_context.hash(req.password)
        
    if not updates:
        raise HTTPException(400, "No fields to update")
        
    try:
        result = db.table("faculty").update(updates).eq("id", faculty_id).execute()
        fac = result.data[0] if result.data else None
        if fac and "password_hash" in fac:
            del fac["password_hash"]
        return {"ok": True, "faculty": fac}
    except Exception as e:
        raise HTTPException(500, str(e))

# ── Faculty Login ───────────────────────────────────────────────

@router.post("/faculty/login")
async def faculty_login(req: FacultyLogin):
    ensure_faculty_table()
    db = get_supabase()
    try:
        # Check email
        email = req.email.strip().lower()
        result = db.table("faculty").select("*").eq("email", email).maybe_single().execute()
        if not result.data:
            raise HTTPException(status_code=401, detail="Invalid email or password")
            
        faculty_user = result.data
        if not pwd_context.verify(req.password, faculty_user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
            
        # Create token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        token_data = {
            "sub": faculty_user["id"],
            "email": faculty_user["email"],
            "name": faculty_user["name"],
            "role": "faculty"
        }
        access_token = create_access_token(data=token_data, expires_delta=access_token_expires)
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "faculty": {
                "id": faculty_user["id"],
                "email": faculty_user["email"],
                "name": faculty_user["name"],
                "department": faculty_user["department"]
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

@router.post("/faculty/signup")
async def faculty_signup(req: FacultyCreate):
    ensure_faculty_table()
    db = get_supabase()
    try:
        hashed_password = pwd_context.hash(req.password)
        result = db.table("faculty").insert({
            "email": req.email.strip().lower(),
            "name": req.name.strip(),
            "department": req.department.strip(),
            "password_hash": hashed_password
        }).execute()
        
        fac = result.data[0]
        del fac["password_hash"]
        return {"ok": True, "faculty": fac}
    except Exception as e:
        if "duplicate key" in str(e).lower() or "unique constraint" in str(e).lower():
            raise HTTPException(400, "Faculty with this email already exists")
        raise HTTPException(500, str(e))
