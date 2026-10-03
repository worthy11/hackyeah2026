"""create_learning_tables

Revision ID: 3b826ab3b003
Revises:
Create Date: 2026-10-03

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "3b826ab3b003"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
    )

    op.create_table(
        "gestures",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("gloss", sa.Text(), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("video_path", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "phrases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("translation", sa.Text(), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "phrase_gestures",
        sa.Column("phrase_id", sa.Integer(), sa.ForeignKey("phrases.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("gesture_id", sa.Integer(), sa.ForeignKey("gestures.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.UniqueConstraint("phrase_id", "position", name="uq_phrase_position"),
    )


def downgrade() -> None:
    op.drop_table("phrase_gestures")
    op.drop_table("phrases")
    op.drop_table("gestures")
    op.drop_table("categories")
