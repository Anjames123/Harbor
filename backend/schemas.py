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