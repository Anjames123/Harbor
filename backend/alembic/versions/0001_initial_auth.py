"""create authentication tables

Revision ID: 0001_initial_auth
Revises:
Create Date: 2026-09-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001_initial_auth"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    user_role = sa.Enum("user", "admin", name="user_role", native_enum=False)
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("email_verified", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)
    op.create_table(
        "auth_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("token_type", sa.String(length=32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_auth_tokens_token_hash", "auth_tokens", ["token_hash"], unique=False)
    op.create_index("ix_auth_tokens_user_id", "auth_tokens", ["user_id"], unique=False)
    op.create_table(
        "revoked_tokens",
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("jti"),
    )


def downgrade() -> None:
    op.drop_table("revoked_tokens")
    op.drop_index("ix_auth_tokens_user_id", table_name="auth_tokens")
    op.drop_index("ix_auth_tokens_token_hash", table_name="auth_tokens")
    op.drop_table("auth_tokens")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")