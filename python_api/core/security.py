# --- MONKEYPATCH FOR PYTHON 3.13 & PASSLIB BCRYPT COMPATIBILITY ---
import bcrypt
if not hasattr(bcrypt, "__about__"):
    class DummyAbout:
        __version__ = getattr(bcrypt, "__version__", "4.0.0")
    bcrypt.__about__ = DummyAbout()

# Patch bcrypt.hashpw and checkpw to truncate >72 byte passwords instead of throwing ValueError
_original_hashpw = bcrypt.hashpw
def _patched_hashpw(password, salt):
    if isinstance(password, str):
        password = password.encode("utf-8")
    if len(password) > 72:
        password = password[:72]
    return _original_hashpw(password, salt)
bcrypt.hashpw = _patched_hashpw

_original_checkpw = getattr(bcrypt, "checkpw", None)
if _original_checkpw:
    def _patched_checkpw(password, hashed_password):
        if isinstance(password, str):
            password = password.encode("utf-8")
        if len(password) > 72:
            password = password[:72]
        if isinstance(hashed_password, str):
            hashed_password = hashed_password.encode("utf-8")
        return _original_checkpw(password, hashed_password)
    bcrypt.checkpw = _patched_checkpw

import passlib.handlers.bcrypt
passlib.handlers.bcrypt.detect_wrap_bug = lambda ident: False
# -----------------------------------------------------------------


from datetime import datetime, timedelta, timezone
import hashlib
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials


from core.config import get_settings
from db.supabase_client import get_supabase

settings = get_settings()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Bearer token extractor
bearer_scheme = HTTPBearer(auto_error=False)


def _pre_hash(password: str) -> str:
    """Pre-hash password using SHA-256 to fit within bcrypt's 72-byte limit."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    return pwd_context.hash(_pre_hash(password))


def verify_password(plain: str, hashed: str) -> bool:
    # 1. Attempt verification with SHA-256 pre-hashed password (new scheme)
    try:
        if pwd_context.verify(_pre_hash(plain), hashed):
            return True
    except Exception:
        pass

    # 2. Fallback to standard verification for legacy direct bcrypt passwords
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.jwt_expire_minutes)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


from fastapi import Depends, HTTPException, status, Request

async def get_current_student(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    """FastAPI dependency — extracts and validates JWT, or allows bypass with admin secret."""
    
    # Check for Admin Secret bypass first (for preview purposes)
    admin_secret = request.headers.get("X-Admin-Secret")
    if admin_secret == settings.admin_secret:
            return {
                "student_id": "ADMIN_PREVIEW",
                "usn": "ADMIN_PREVIEW",
                "branch": "CS",
                "token": "ADMIN_SECRET_BYPASS"
            }

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization credentials missing",
        )

    token = credentials.credentials
    payload = decode_token(token)

    student_id = payload.get("sub")
    # Support both 'usn' (new) and 'roll_number' (legacy)
    usn = payload.get("usn") or payload.get("roll_number")
    name = payload.get("name", "Student")
    branch = payload.get("branch", "CS")

    if not student_id or not usn:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload: student_id or usn missing",
        )

    # ── SELF-HEAL: Resolve 'Syncing...' branch if it leaked into JWT ──
    if branch == "Syncing..." or not branch:
        try:
            db = get_supabase()
            res = db.table("students").select("branch, name").eq("id", student_id).maybe_single().execute()
            if res.data:
                if res.data.get("branch"):
                    branch = res.data["branch"]
                if res.data.get("name"):
                    name = res.data["name"]
                print(f"[SECURITY] Resolved profile for student {usn}")
        except:
            branch = "CS" # Fallback to CS if DB check fails

    return {
        "student_id": student_id,
        "usn": usn,
        "name": name,
        "branch": branch,
        "token": token
    }
