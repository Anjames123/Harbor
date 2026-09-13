import logging
import re
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import SessionLocal, get_db
from backend.email_service import send_action_email
from backend.models import (
    AuthToken,
    Bookmark,
    Comment,
    Conversation,
    ConversationMember,
    Follow,
    Message,
    Notification,
    NotificationPreference,
    Post,
    PostLike,
    Repost,
    RevokedToken,
    User,
    UserRole,
)
from backend.object_storage import create_download_url, create_upload_url
from backend.schemas import (
    AuthResponse,
    ChatMessageResponse,
    CommentCreateInput,
    CommentResponse,
    ConversationResponse,
    ConversationUser,
    EmailInput,
    EmailTokenInput,
    LoginInput,
    MessageResponse,
    MessageCreateInput,
    NotificationPreferencesResponse,
    NotificationPreferencesUpdateInput,
    NotificationResponse,
    PasswordResetInput,
    PostCreateInput,
    PostResponse,
    ProfileUpdateInput,
    ProfileResponse,
    RegisterInput,
    SocialUser,
    UploadUrlInput,
    UploadUrlResponse,
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


class ChatConnectionManager:
    def __init__(self) -> None:
        self.connections: dict[UUID, set[WebSocket]] = {}

    async def connect(self, user_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.setdefault(user_id, set()).add(websocket)

    def disconnect(self, user_id: UUID, websocket: WebSocket) -> None:
        sockets = self.connections.get(user_id)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            self.connections.pop(user_id, None)

    def is_online(self, user_id: UUID) -> bool:
        return bool(self.connections.get(user_id))

    async def send_user(self, user_id: UUID, payload: dict) -> None:
        for websocket in list(self.connections.get(user_id, set())):
            try:
                await websocket.send_json(payload)
            except Exception:
                self.disconnect(user_id, websocket)

    async def broadcast(self, payload: dict, exclude: UUID | None = None) -> None:
        for user_id in list(self.connections):
            if user_id != exclude:
                await self.send_user(user_id, payload)


chat_manager = ChatConnectionManager()


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


def conversation_user(db: Session, user: User) -> ConversationUser:
    return ConversationUser(
        **social_user(db, user, user).model_dump(),
        is_online=chat_manager.is_online(user.id) or user.is_online,
    )


def message_response(db: Session, message: Message, viewer_id: UUID) -> ChatMessageResponse:
    sender = db.get(User, message.sender_id)
    if not sender:
        raise HTTPException(status_code=500, detail="Message sender not found")
    return ChatMessageResponse(
        id=message.id,
        conversationId=message.conversation_id,
        content=message.content,
        sender=conversation_user(db, sender),
        createdAt=message.created_at,
        readAt=message.read_at,
        isMine=message.sender_id == viewer_id,
    )


def conversation_for_user(
    db: Session, conversation_id: str | UUID, user_id: UUID
) -> Conversation:
    try:
        parsed_id = UUID(str(conversation_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="Conversation not found") from None
    conversation = db.scalar(
        select(Conversation)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(Conversation.id == parsed_id, ConversationMember.user_id == user_id)
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


def other_member(db: Session, conversation: Conversation, user_id: UUID) -> User:
    member = db.scalar(
        select(ConversationMember)
        .where(
            ConversationMember.conversation_id == conversation.id,
            ConversationMember.user_id != user_id,
        )
    )
    other = db.get(User, member.user_id) if member else None
    if not other:
        raise HTTPException(status_code=404, detail="Conversation member not found")
    return other


def conversation_response(
    db: Session, conversation: Conversation, viewer_id: UUID
) -> ConversationResponse:
    other = other_member(db, conversation, viewer_id)
    last_message = db.scalar(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    unread_count = len(
        db.scalars(
            select(Message).where(
                Message.conversation_id == conversation.id,
                Message.sender_id != viewer_id,
                Message.read_at.is_(None),
            )
        ).all()
    )
    return ConversationResponse(
        id=conversation.id,
        otherUser=conversation_user(db, other),
        lastMessage=message_response(db, last_message, viewer_id) if last_message else None,
        unreadCount=unread_count,
        updatedAt=conversation.updated_at,
    )


def notification_response(
    db: Session, notification: Notification
) -> NotificationResponse:
    actor = db.get(User, notification.actor_id) if notification.actor_id else None
    return NotificationResponse(
        id=notification.id,
        type=notification.type,
        title=notification.title,
        body=notification.body,
        actor=conversation_user(db, actor) if actor else None,
        conversationId=notification.conversation_id,
        messageId=notification.message_id,
        isRead=notification.is_read,
        createdAt=notification.created_at,
    )


def add_user_notification(
    db: Session,
    recipient_id: UUID,
    actor_id: UUID,
    notification_type: str,
    title: str,
    body: str,
    preference: str,
    conversation_id: UUID | None = None,
    message_id: UUID | None = None,
) -> Notification | None:
    preferences = db.get(NotificationPreference, recipient_id)
    if preferences and not getattr(preferences, preference):
        return None
    notification = Notification(
        recipient_id=recipient_id,
        actor_id=actor_id,
        type=notification_type,
        title=title,
        body=body[:500],
        conversation_id=conversation_id,
        message_id=message_id,
    )
    db.add(notification)
    return notification


def create_message(
    db: Session, conversation: Conversation, sender: User, content: str
) -> tuple[Message, User]:
    normalized = content.strip()
    if not normalized:
        raise HTTPException(status_code=422, detail="Message cannot be empty")
    recipient = other_member(db, conversation, sender.id)
    message = Message(
        conversation_id=conversation.id,
        sender_id=sender.id,
        content=normalized,
    )
    conversation.updated_at = datetime.now(UTC)
    db.add(message)
    db.flush()
    add_user_notification(
        db,
        recipient_id=recipient.id,
        actor_id=sender.id,
        notification_type="message",
        title=f"New message from {sender.name}",
        body=message.content,
        preference="message_notifications",
        conversation_id=conversation.id,
        message_id=message.id,
    )
    db.commit()
    db.refresh(message)
    return message, recipient


def websocket_user(token: str | None, db: Session) -> User | None:
    if not token:
        return None
    try:
        claims = decode_access_token(token)
        jti = claims.get("jti")
        user_id = user_id_from_claims(claims)
    except (jwt.InvalidTokenError, ValueError):
        return None
    if not isinstance(jti, str) or db.get(RevokedToken, jti):
        return None
    return db.get(User, user_id)


@app.get("/api/conversations", response_model=list[ConversationResponse])
def list_conversations(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ConversationResponse]:
    conversations = db.scalars(
        select(Conversation)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(ConversationMember.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
    ).all()
    return [conversation_response(db, conversation, user.id) for conversation in conversations]


@app.post("/api/conversations/direct/{user_id}", response_model=ConversationResponse)
def start_direct_conversation(
    user_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationResponse:
    if str(user.id) == user_id:
        raise HTTPException(status_code=400, detail="You cannot message yourself")
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    existing = None
    candidate_ids = db.scalars(
        select(ConversationMember.conversation_id).where(
            ConversationMember.user_id == user.id
        )
    ).all()
    for conversation_id in candidate_ids:
        member_ids = set(
            db.scalars(
                select(ConversationMember.user_id).where(
                    ConversationMember.conversation_id == conversation_id
                )
            ).all()
        )
        if member_ids == {user.id, target.id}:
            existing = db.get(Conversation, conversation_id)
            break
    if not existing:
        existing = Conversation()
        db.add(existing)
        db.flush()
        db.add_all(
            [
                ConversationMember(conversation_id=existing.id, user_id=user.id),
                ConversationMember(conversation_id=existing.id, user_id=target.id),
            ]
        )
        db.commit()
        db.refresh(existing)
    return conversation_response(db, existing, user.id)


@app.get("/api/conversations/{conversation_id}/messages", response_model=list[ChatMessageResponse])
def list_messages(
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ChatMessageResponse]:
    conversation = conversation_for_user(db, conversation_id, user.id)
    messages = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.asc())
        .limit(100)
    ).all()
    return [message_response(db, message, user.id) for message in messages]


@app.post("/api/conversations/{conversation_id}/messages", response_model=ChatMessageResponse, status_code=201)
async def send_message(
    conversation_id: str,
    payload: MessageCreateInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatMessageResponse:
    conversation = conversation_for_user(db, conversation_id, user.id)
    message, recipient = create_message(db, conversation, user, payload.content)
    response = message_response(db, message, user.id)
    serialized = {"type": "message", "message": response.model_dump(mode="json", by_alias=True)}
    await chat_manager.send_user(user.id, serialized)
    await chat_manager.send_user(recipient.id, serialized)
    return response


@app.post("/api/conversations/{conversation_id}/read", response_model=MessageResponse)
async def mark_conversation_read(
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    conversation = conversation_for_user(db, conversation_id, user.id)
    now = datetime.now(UTC)
    db.query(Message).filter(
        Message.conversation_id == conversation.id,
        Message.sender_id != user.id,
        Message.read_at.is_(None),
    ).update({Message.read_at: now}, synchronize_session=False)
    member = db.scalar(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation.id,
            ConversationMember.user_id == user.id,
        )
    )
    if member:
        member.last_read_at = now
    db.commit()
    other = other_member(db, conversation, user.id)
    await chat_manager.send_user(
        other.id,
        {
            "type": "read",
            "conversationId": str(conversation.id),
            "userId": str(user.id),
            "readAt": now.isoformat(),
        },
    )
    return MessageResponse(message="Conversation marked as read")


@app.get("/api/notifications", response_model=list[NotificationResponse])
def list_notifications(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[NotificationResponse]:
    notifications = db.scalars(
        select(Notification)
        .where(Notification.recipient_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
    ).all()
    return [notification_response(db, notification) for notification in notifications]


@app.post("/api/notifications/read", response_model=MessageResponse)
def mark_notifications_read(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    db.query(Notification).filter(
        Notification.recipient_id == user.id,
        Notification.is_read.is_(False),
    ).update({Notification.is_read: True}, synchronize_session=False)
    db.commit()
    return MessageResponse(message="Notifications marked as read")


@app.get("/api/notification-preferences", response_model=NotificationPreferencesResponse)
def get_notification_preferences(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotificationPreferencesResponse:
    preferences = db.get(NotificationPreference, user.id)
    if not preferences:
        preferences = NotificationPreference(user_id=user.id)
        db.add(preferences)
        db.commit()
        db.refresh(preferences)
    return NotificationPreferencesResponse.model_validate(preferences, from_attributes=True)


@app.patch("/api/notification-preferences", response_model=NotificationPreferencesResponse)
def update_notification_preferences(
    payload: NotificationPreferencesUpdateInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotificationPreferencesResponse:
    preferences = db.get(NotificationPreference, user.id)
    if not preferences:
        preferences = NotificationPreference(user_id=user.id)
        db.add(preferences)
    for field, value in payload.model_dump(exclude_unset=True, by_alias=False).items():
        if value is not None:
            setattr(preferences, field, value)
    db.commit()
    db.refresh(preferences)
    return NotificationPreferencesResponse.model_validate(preferences, from_attributes=True)


@app.websocket("/ws/chat")
async def chat_websocket(websocket: WebSocket) -> None:
    db = SessionLocal()
    user = websocket_user(websocket.query_params.get("token"), db)
    if not user:
        await websocket.close(code=4401)
        db.close()
        return
    await chat_manager.connect(user.id, websocket)
    user.is_online = True
    db.commit()
    await chat_manager.broadcast(
        {"type": "presence", "userId": str(user.id), "isOnline": True},
        exclude=user.id,
    )
    try:
        while True:
            event = await websocket.receive_json()
            event_type = event.get("type")
            if event_type == "message":
                conversation = conversation_for_user(db, event.get("conversationId"), user.id)
                message, recipient = create_message(db, conversation, user, str(event.get("content", "")))
                payload = {
                    "type": "message",
                    "message": message_response(db, message, user.id).model_dump(
                        mode="json", by_alias=True
                    ),
                }
                await chat_manager.send_user(user.id, payload)
                await chat_manager.send_user(recipient.id, payload)
            elif event_type == "typing":
                conversation = conversation_for_user(db, event.get("conversationId"), user.id)
                recipient = other_member(db, conversation, user.id)
                await chat_manager.send_user(
                    recipient.id,
                    {
                        "type": "typing",
                        "conversationId": str(conversation.id),
                        "userId": str(user.id),
                        "isTyping": bool(event.get("isTyping")),
                    },
                )
            elif event_type == "read":
                conversation = conversation_for_user(db, event.get("conversationId"), user.id)
                now = datetime.now(UTC)
                db.query(Message).filter(
                    Message.conversation_id == conversation.id,
                    Message.sender_id != user.id,
                    Message.read_at.is_(None),
                ).update({Message.read_at: now}, synchronize_session=False)
                member = db.scalar(
                    select(ConversationMember).where(
                        ConversationMember.conversation_id == conversation.id,
                        ConversationMember.user_id == user.id,
                    )
                )
                if member:
                    member.last_read_at = now
                db.commit()
                recipient = other_member(db, conversation, user.id)
                await chat_manager.send_user(
                    recipient.id,
                    {
                        "type": "read",
                        "conversationId": str(conversation.id),
                        "userId": str(user.id),
                        "readAt": now.isoformat(),
                    },
                )
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Chat websocket failed for user %s", user.id)
    finally:
        chat_manager.disconnect(user.id, websocket)
        if not chat_manager.is_online(user.id):
            user.is_online = False
            user.last_seen_at = datetime.now(UTC)
            db.commit()
            await chat_manager.broadcast(
                {"type": "presence", "userId": str(user.id), "isOnline": False},
                exclude=user.id,
            )
        db.close()


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

    name = payload.name.strip()
    username_base = re.sub(r"[^a-z0-9_]", "", name.lower().replace(" ", "_"))[:24] or "member"
    username = username_base
    suffix = 1
    while db.scalar(select(User).where(User.username == username)):
        username = f"{username_base[:28 - len(str(suffix))]}{suffix}"
        suffix += 1
    user = User(
        name=name,
        username=username,
        email=email,
        password_hash=hash_password(payload.password),
    )
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


def social_user(db: Session, user: User, viewer: User) -> SocialUser:
    followers_count = db.scalar(
        select(func.count()).select_from(Follow).where(Follow.following_id == user.id)
    ) or 0
    following_count = db.scalar(
        select(func.count()).select_from(Follow).where(Follow.follower_id == user.id)
    ) or 0
    is_following = db.scalar(
        select(Follow).where(
            Follow.follower_id == viewer.id,
            Follow.following_id == user.id,
        )
    ) is not None
    return SocialUser(
        id=user.id,
        name=user.name,
        username=user.username,
        bio=user.bio,
        avatar_path=user.avatar_path,
        followers_count=followers_count,
        following_count=following_count,
        is_following=is_following,
    )


def comment_response(db: Session, comment: Comment, viewer: User) -> CommentResponse:
    author = db.get(User, comment.author_id)
    if not author:
        raise HTTPException(status_code=500, detail="Comment author is missing")
    return CommentResponse(
        id=comment.id,
        post_id=comment.post_id,
        parent_id=comment.parent_id,
        content=comment.content,
        author=social_user(db, author, viewer),
        created_at=comment.created_at,
    )


def post_response(db: Session, post: Post, viewer: User) -> PostResponse:
    author = db.get(User, post.author_id)
    if not author:
        raise HTTPException(status_code=500, detail="Post author is missing")
    likes_count = db.scalar(
        select(func.count()).select_from(PostLike).where(PostLike.post_id == post.id)
    ) or 0
    comments_count = db.scalar(
        select(func.count()).select_from(Comment).where(Comment.post_id == post.id)
    ) or 0
    reposts_count = db.scalar(
        select(func.count()).select_from(Repost).where(Repost.post_id == post.id)
    ) or 0
    comments = db.scalars(
        select(Comment)
        .where(Comment.post_id == post.id, Comment.parent_id.is_(None))
        .order_by(Comment.created_at.asc())
        .limit(3)
    ).all()
    return PostResponse(
        id=post.id,
        content=post.content,
        image_path=post.image_path,
        created_at=post.created_at,
        author=social_user(db, author, viewer),
        likes_count=likes_count,
        comments_count=comments_count,
        reposts_count=reposts_count,
        is_liked=db.scalar(
            select(PostLike).where(PostLike.post_id == post.id, PostLike.user_id == viewer.id)
        ) is not None,
        is_bookmarked=db.scalar(
            select(Bookmark).where(Bookmark.post_id == post.id, Bookmark.user_id == viewer.id)
        ) is not None,
        is_reposted=db.scalar(
            select(Repost).where(Repost.post_id == post.id, Repost.user_id == viewer.id)
        ) is not None,
        comments=[comment_response(db, comment, viewer) for comment in comments],
    )


def discoverable_posts(db: Session, viewer: User, *, explore: bool = False) -> list[Post]:
    if explore:
        return db.scalars(select(Post).order_by(Post.created_at.desc()).limit(60)).all()
    following_ids = db.scalars(
        select(Follow.following_id).where(Follow.follower_id == viewer.id)
    ).all()
    author_ids = [viewer.id, *following_ids]
    reposted_ids = db.scalars(
        select(Repost.post_id).where(Repost.user_id.in_(author_ids))
    ).all()
    return db.scalars(
        select(Post)
        .where(or_(Post.author_id.in_(author_ids), Post.id.in_(reposted_ids)))
        .order_by(Post.created_at.desc())
        .limit(60)
    ).all()


@app.get("/api/feed", response_model=list[PostResponse])
def home_feed(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PostResponse]:
    return [post_response(db, post, user) for post in discoverable_posts(db, user)]


@app.get("/api/explore")
def explore_feed(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, list]:
    posts = discoverable_posts(db, user, explore=True)
    seen: set = set()
    people: list[SocialUser] = []
    for post in posts:
        author = db.get(User, post.author_id)
        if author and author.id not in seen and author.id != user.id:
            seen.add(author.id)
            people.append(social_user(db, author, user))
    return {
        "posts": [post_response(db, post, user) for post in posts],
        "users": people[:8],
    }


@app.get("/api/search")
def search(
    q: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, list]:
    query = q.strip()
    if not query:
        return {"users": [], "posts": []}
    term = f"%{query.lstrip('@#')}%"
    users = db.scalars(
        select(User)
        .where(or_(User.name.ilike(term), User.username.ilike(term)))
        .order_by(User.name.asc())
        .limit(20)
    ).all()
    posts = db.scalars(
        select(Post).where(Post.content.ilike(f"%{query}%")).order_by(Post.created_at.desc()).limit(30)
    ).all()
    return {
        "users": [social_user(db, item, user) for item in users],
        "posts": [post_response(db, item, user) for item in posts],
    }


def profile_response(db: Session, target: User, viewer: User) -> ProfileResponse:
    posts = db.scalars(
        select(Post).where(Post.author_id == target.id).order_by(Post.created_at.desc()).limit(60)
    ).all()
    return ProfileResponse(
        **social_user(db, target, viewer).model_dump(),
        posts=[post_response(db, post, viewer) for post in posts],
    )


@app.get("/api/users/me/profile", response_model=ProfileResponse)
def my_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ProfileResponse:
    return profile_response(db, user, user)


@app.patch("/api/users/me/profile", response_model=SocialUser)
def update_profile(
    payload: ProfileUpdateInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SocialUser:
    data = payload.model_dump(exclude_unset=True, by_alias=False)
    username = data.get("username")
    if username:
        existing = db.scalar(select(User).where(User.username == username, User.id != user.id))
        if existing:
            raise HTTPException(status_code=409, detail="That username is already taken")
        data["username"] = username.lower()
    for field, value in data.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return social_user(db, user, user)


@app.get("/api/users/{user_id}", response_model=ProfileResponse)
def get_profile(
    user_id: str,
    viewer: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SocialUser:
    try:
        target = db.get(User, user_id)
    except (ValueError, TypeError):
        target = None
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    return profile_response(db, target, viewer)


@app.post("/api/users/{user_id}/follow", response_model=MessageResponse)
def follow_user(
    user_id: str,
    viewer: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    if str(viewer.id) == user_id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if db.scalar(select(Follow).where(Follow.follower_id == viewer.id, Follow.following_id == target.id)):
        return MessageResponse(message="Already following")
    db.add(Follow(follower_id=viewer.id, following_id=target.id))
    add_user_notification(
        db,
        recipient_id=target.id,
        actor_id=viewer.id,
        notification_type="follow",
        title=f"{viewer.name} followed you",
        body=f"@{viewer.username or viewer.name} is now following your posts.",
        preference="follow_notifications",
    )
    db.commit()
    return MessageResponse(message="Following")


@app.delete("/api/users/{user_id}/follow", response_model=MessageResponse)
def unfollow_user(
    user_id: str,
    viewer: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    db.execute(
        delete(Follow).where(Follow.follower_id == viewer.id, Follow.following_id == target.id)
    )
    db.commit()
    return MessageResponse(message="Unfollowed")


@app.post("/api/posts", response_model=PostResponse, status_code=201)
def create_post(
    payload: PostCreateInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PostResponse:
    content = payload.content.strip()
    if not content and not payload.image_path:
        raise HTTPException(status_code=422, detail="A post needs text or an image")
    if payload.image_path and not payload.image_path.startswith("/objects/"):
        raise HTTPException(status_code=422, detail="Invalid image path")
    post = Post(author_id=user.id, content=content, image_path=payload.image_path)
    db.add(post)
    db.commit()
    db.refresh(post)
    return post_response(db, post, user)


def post_action(
    db: Session,
    model: type,
    post_id: str,
    user_id,
    key: str = "post_id",
) -> tuple[bool, Post]:
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    where = [getattr(model, key) == post.id, model.user_id == user_id]
    record = db.scalar(select(model).where(*where))
    if record:
        db.delete(record)
        active = False
    else:
        db.add(model(post_id=post.id, user_id=user_id))
        active = True
    db.commit()
    return active, post


@app.post("/api/posts/{post_id}/like", response_model=PostResponse)
def toggle_like(
    post_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PostResponse:
    active, post = post_action(db, PostLike, post_id, user.id)
    if active and post.author_id != user.id:
        add_user_notification(
            db,
            recipient_id=post.author_id,
            actor_id=user.id,
            notification_type="like",
            title=f"{user.name} liked your post",
            body="Someone in your harbor liked something you shared.",
            preference="interaction_notifications",
        )
        db.commit()
    return post_response(db, post, user)


@app.post("/api/posts/{post_id}/bookmark", response_model=PostResponse)
def toggle_bookmark(
    post_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PostResponse:
    _, post = post_action(db, Bookmark, post_id, user.id)
    return post_response(db, post, user)


@app.post("/api/posts/{post_id}/repost", response_model=PostResponse)
def toggle_repost(
    post_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PostResponse:
    active, post = post_action(db, Repost, post_id, user.id)
    if active and post.author_id != user.id:
        add_user_notification(
            db,
            recipient_id=post.author_id,
            actor_id=user.id,
            notification_type="repost",
            title=f"{user.name} reposted your post",
            body="Your post is traveling a little further through the harbor.",
            preference="interaction_notifications",
        )
        db.commit()
    return post_response(db, post, user)


@app.get("/api/bookmarks", response_model=list[PostResponse])
def bookmarks(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PostResponse]:
    posts = db.scalars(
        select(Post)
        .join(Bookmark, Bookmark.post_id == Post.id)
        .where(Bookmark.user_id == user.id)
        .order_by(Bookmark.created_at.desc())
    ).all()
    return [post_response(db, post, user) for post in posts]


@app.post("/api/posts/{post_id}/comments", response_model=CommentResponse, status_code=201)
def add_comment(
    post_id: str,
    payload: CommentCreateInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommentResponse:
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    comment = Comment(post_id=post.id, author_id=user.id, content=payload.content.strip())
    db.add(comment)
    if post.author_id != user.id:
        add_user_notification(
            db,
            recipient_id=post.author_id,
            actor_id=user.id,
            notification_type="comment",
            title=f"{user.name} commented on your post",
            body=comment.content,
            preference="interaction_notifications",
        )
    db.commit()
    db.refresh(comment)
    return comment_response(db, comment, user)


@app.get("/api/posts/{post_id}/comments", response_model=list[CommentResponse])
def list_comments(
    post_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CommentResponse]:
    comments = db.scalars(
        select(Comment).where(Comment.post_id == post_id).order_by(Comment.created_at.asc())
    ).all()
    return [comment_response(db, comment, user) for comment in comments]


@app.post("/api/comments/{comment_id}/replies", response_model=CommentResponse, status_code=201)
def add_reply(
    comment_id: str,
    payload: CommentCreateInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommentResponse:
    parent = db.get(Comment, comment_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Comment not found")
    reply = Comment(
        post_id=parent.post_id,
        parent_id=parent.id,
        author_id=user.id,
        content=payload.content.strip(),
    )
    db.add(reply)
    if parent.author_id != user.id:
        add_user_notification(
            db,
            recipient_id=parent.author_id,
            actor_id=user.id,
            notification_type="reply",
            title=f"{user.name} replied to your comment",
            body=reply.content,
            preference="interaction_notifications",
        )
    db.commit()
    db.refresh(reply)
    return comment_response(db, reply, user)


@app.post("/api/uploads/request-url", response_model=UploadUrlResponse)
def request_upload_url(
    payload: UploadUrlInput,
    _: User = Depends(get_current_user),
) -> UploadUrlResponse:
    try:
        upload_url, object_path = create_upload_url(payload.content_type)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return UploadUrlResponse(uploadURL=upload_url, objectPath=object_path)


@app.get("/api/storage/objects/{object_path:path}")
def serve_object(object_path: str) -> RedirectResponse:
    try:
        url = create_download_url(f"/objects/{object_path}")
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return RedirectResponse(url=url, status_code=307)