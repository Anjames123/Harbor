import logging
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import get_db
from backend.email_service import send_action_email
from backend.models import AuthToken, RevokedToken, User, UserRole
from backend.schemas import (
    AuthResponse,
    EmailInput,
    EmailTokenInput,
    LoginInput,
    MessageResponse,
    PasswordResetInput,
    RegisterInput,
    UserResponse,
)
from backend.security import (
    create_access_token,
    create_one_time_token,
    decode_access_token,
    hash_password,
    hash_token,
    normalize_email,
    user_id_from_claims,
    verify_password,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("secure-auth")
settings = get_settings()
app = FastAPI(
    title="Secure Auth API",
    version="1.0.0",
    description="Registration, JWT authentication, email verification, password reset, and roles.",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url] if settings.frontend_url != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
bearer = HTTPBearer(auto_error=False)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cache-Control"] = "no-store"
    return response


def public_user(user: User) -> UserResponse:
    return UserResponse.model_validate(user)


def auth_response(user: User) -> AuthResponse:
    token, _, _ = create_access_token(user)
    return AuthResponse(access_token=token, user=public_user(user))


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        claims = decode_access_token(credentials.credentials)
        jti = claims.get("jti")
        user_id = user_id_from_claims(claims)
    except (jwt.InvalidTokenError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token") from None

    if not isinstance(jti, str):
        raise HTTPException(status_code=401, detail="Invalid token")
    if db.get(RevokedToken, jti):
        raise HTTPException(status_code=401, detail="Session has ended")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user


def issue_one_time_token(
    db: Session,
    user: User,
    token_type: str,
    expires_at: datetime,
) -> str:
    raw_token, token_hash = create_one_time_token()
    db.add(
        AuthToken(
            user_id=user.id,
            token_hash=token_hash,
            token_type=token_type,
            expires_at=expires_at,
        )
    )
    db.commit()
    return raw_token


def consume_one_time_token(
    db: Session,
    raw_token: str,
    token_type: str,
) -> tuple[AuthToken, User]:
    token = db.scalar(
        select(AuthToken).where(
            AuthToken.token_hash == hash_token(raw_token),
            AuthToken.token_type == token_type,
        )
    )
    if not token or token.used_at or token.expires_at <= datetime.now(UTC):
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    user = db.get(User, token.user_id)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid token")
    token.used_at = datetime.now(UTC)
    return token, user


@app.get("/api/healthz")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/register", response_model=AuthResponse, status_code=201)
def register(payload: RegisterInput, db: Session = Depends(get_db)) -> AuthResponse:
    email = normalize_email(str(payload.email))
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user = User(name=payload.name.strip(), email=email, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = issue_one_time_token(
        db,
        user,
        "email_verification",
        datetime.now(UTC) + timedelta(hours=settings.verification_token_expire_hours),
    )
    send_action_email(
        recipient=user.email,
        subject="Verify your email address",
        action_path="/verify-email",
        token=token,
    )
    return auth_response(user)


@app.post("/api/auth/login", response_model=AuthResponse)
def login(payload: LoginInput, db: Session = Depends(get_db)) -> AuthResponse:
    email = normalize_email(str(payload.email))
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return auth_response(user)


@app.post("/api/auth/verify-email", response_model=MessageResponse)
def verify_email(payload: EmailTokenInput, db: Session = Depends(get_db)) -> MessageResponse:
    _, user = consume_one_time_token(db, payload.token, "email_verification")
    user.email_verified = True
    db.commit()
    return MessageResponse(message="Your email has been verified.")


@app.post("/api/auth/verify-email/resend", response_model=MessageResponse)
def resend_verification(payload: EmailInput, db: Session = Depends(get_db)) -> MessageResponse:
    user = db.scalar(select(User).where(User.email == normalize_email(str(payload.email))))
    if user and not user.email_verified:
        token = issue_one_time_token(
            db,
            user,
            "email_verification",
            datetime.now(UTC) + timedelta(hours=settings.verification_token_expire_hours),
        )
        send_action_email(
            recipient=user.email,
            subject="Verify your email address",
            action_path="/verify-email",
            token=token,
        )
    return MessageResponse(message="If that account exists, a verification email is on its way.")


@app.post("/api/auth/password-reset/request", response_model=MessageResponse)
def request_password_reset(payload: EmailInput, db: Session = Depends(get_db)) -> MessageResponse:
    user = db.scalar(select(User).where(User.email == normalize_email(str(payload.email))))
    if user:
        token = issue_one_time_token(
            db,
            user,
            "password_reset",
            datetime.now(UTC) + timedelta(minutes=settings.password_reset_token_expire_minutes),
        )
        send_action_email(
            recipient=user.email,
            subject="Reset your password",
            action_path="/reset-password",
            token=token,
        )
    return MessageResponse(message="If that account exists, a password reset email is on its way.")


@app.post("/api/auth/password-reset/confirm", response_model=MessageResponse)
def confirm_password_reset(payload: PasswordResetInput, db: Session = Depends(get_db)) -> MessageResponse:
    _, user = consume_one_time_token(db, payload.token, "password_reset")
    user.password_hash = hash_password(payload.password)
    db.commit()
    return MessageResponse(message="Your password has been updated. You can now sign in.")


@app.post("/api/auth/logout", status_code=204)
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    del user
    if credentials:
        try:
            claims = decode_access_token(credentials.credentials)
            jti = claims.get("jti")
            exp = claims.get("exp")
            if isinstance(jti, str) and isinstance(exp, (int, float)):
                db.add(
                    RevokedToken(
                        jti=jti,
                        expires_at=datetime.fromtimestamp(exp, UTC),
                    )
                )
                db.commit()
        except jwt.InvalidTokenError:
            pass
    return Response(status_code=204)


@app.get("/api/auth/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)) -> UserResponse:
    return public_user(user)


@app.get("/api/users", response_model=list[UserResponse])
def list_users(
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> list[UserResponse]:
    users = db.scalars(select(User).order_by(User.created_at.desc())).all()
    return [public_user(user) for user in users]