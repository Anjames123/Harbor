"""add social media core tables

Revision ID: 0002_social_core
Revises: 0001_initial_auth
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002_social_core"
down_revision: Union[str, Sequence[str], None] = "0001_initial_auth"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("username", sa.String(length=32), nullable=True))
    op.add_column("users", sa.Column("bio", sa.String(length=280), nullable=True))
    op.add_column("users", sa.Column("avatar_path", sa.String(length=512), nullable=True))
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "follows",
        sa.Column("follower_id", sa.Uuid(), nullable=False),
        sa.Column("following_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["follower_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["following_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("follower_id", "following_id"),
    )
    op.create_table(
        "posts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("image_path", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_posts_author_id", "posts", ["author_id"])
    op.create_index("ix_posts_created_at", "posts", ["created_at"])
    for table, columns, foreign in [
        ("post_likes", ("post_id", "user_id"), (("post_id", "posts.id"), ("user_id", "users.id"))),
        ("bookmarks", ("post_id", "user_id"), (("post_id", "posts.id"), ("user_id", "users.id"))),
        ("reposts", ("post_id", "user_id"), (("post_id", "posts.id"), ("user_id", "users.id"))),
    ]:
        op.create_table(
            table,
            sa.Column("post_id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint(*columns),
        )
    op.create_table(
        "comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("post_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("content", sa.String(length=1000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["comments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_comments_post_id", "comments", ["post_id"])
    op.create_index("ix_comments_author_id", "comments", ["author_id"])


def downgrade() -> None:
    op.drop_index("ix_comments_author_id", table_name="comments")
    op.drop_index("ix_comments_post_id", table_name="comments")
    op.drop_table("comments")
    op.drop_table("reposts")
    op.drop_table("bookmarks")
    op.drop_table("post_likes")
    op.drop_index("ix_posts_created_at", table_name="posts")
    op.drop_index("ix_posts_author_id", table_name="posts")
    op.drop_table("posts")
    op.drop_table("follows")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_column("users", "avatar_path")
    op.drop_column("users", "bio")
    op.drop_column("users", "username")