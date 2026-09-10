import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import jwt
from pwdlib import PasswordHash

from backend.config import get_settings
from backend.models import User


password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)


def create_access_token(user: User) -> tuple[str, datetime, str]:
    settings = get_settings()
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.access_token_expire_minutes)
    jti = uuid4().hex
    payload = {
        "sub": str(user.id),
        "role": user.role.value,
        "jti": jti,
        "iat": now,
        "exp": expires_at,
        "type": "access",
    }
    return jwt.encode(payload, settings.session_secret, algorithm="HS256"), expires_at, jti


def decode_access_token(token: str) -> dict[str, object]:
    return jwt.decode(token, get_settings().session_secret, algorithms=["HS256"])


def create_one_time_token() -> tuple[str, str]:
    raw_token = secrets.token_urlsafe(32)
    return raw_token, hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def user_id_from_claims(claims: dict[str, object]) -> UUID:
    subject = claims.get("sub")
    if not isinstance(subject, str):
        raise ValueError("Token subject is missing")
    return UUID(subject)