from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from backend.models import UserRole


class RegisterInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class EmailInput(BaseModel):
    email: EmailStr


class EmailTokenInput(BaseModel):
    token: str = Field(min_length=20)


class PasswordResetInput(BaseModel):
    token: str = Field(min_length=20)
    password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    id: UUID
    name: str
    email: EmailStr
    role: UserRole
    email_verified: bool = Field(alias="emailVerified")
    username: str | None = None
    bio: str | None = None
    avatar_path: str | None = Field(default=None, alias="avatarPath")
    created_at: datetime = Field(alias="createdAt")


class AuthResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    access_token: str = Field(alias="accessToken")
    token_type: str = Field(default="bearer", alias="tokenType")
    user: UserResponse


class MessageResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    error: str


class SocialUser(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    id: UUID
    name: str
    username: str | None = None
    bio: str | None = None
    avatar_path: str | None = Field(default=None, alias="avatarPath")
    followers_count: int = Field(default=0, alias="followersCount")
    following_count: int = Field(default=0, alias="followingCount")
    is_following: bool = Field(default=False, alias="isFollowing")


class ProfileUpdateInput(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    username: str | None = Field(default=None, min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_]+$")
    bio: str | None = Field(default=None, max_length=280)
    avatar_path: str | None = Field(default=None, alias="avatarPath")


class PostCreateInput(BaseModel):
    content: str = Field(default="", max_length=5000)
    image_path: str | None = Field(default=None, alias="imagePath", max_length=512)


class CommentCreateInput(BaseModel):
    content: str = Field(min_length=1, max_length=1000)


class CommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)

    id: UUID
    post_id: UUID = Field(alias="postId")
    parent_id: UUID | None = Field(default=None, alias="parentId")
    content: str
    author: SocialUser
    created_at: datetime = Field(alias="createdAt")


class PostResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: UUID
    content: str
    image_path: str | None = Field(default=None, alias="imagePath")
    created_at: datetime = Field(alias="createdAt")
    author: SocialUser
    likes_count: int = Field(alias="likesCount")
    comments_count: int = Field(alias="commentsCount")
    reposts_count: int = Field(alias="repostsCount")
    is_liked: bool = Field(alias="isLiked")
    is_bookmarked: bool = Field(alias="isBookmarked")
    is_reposted: bool = Field(alias="isReposted")
    comments: list[CommentResponse] = []


class ProfileResponse(SocialUser):
    posts: list[PostResponse] = []


class UploadUrlInput(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    size: int = Field(gt=0, le=10_000_000)
    content_type: str = Field(alias="contentType", pattern=r"^image/(jpeg|png|webp|gif)$")


class UploadUrlResponse(BaseModel):
    upload_url: str = Field(alias="uploadURL")
    object_path: str = Field(alias="objectPath")