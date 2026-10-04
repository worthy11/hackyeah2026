"""extend_gesture_columns

Revision ID: a1c3e7f9b2d4
Revises: 3b826ab3b003
Create Date: 2026-10-03

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1c3e7f9b2d4"
down_revision: Union[str, None] = "3b826ab3b003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("gestures", sa.Column("start_ms", sa.Float(), nullable=True))
    op.add_column("gestures", sa.Column("end_ms",   sa.Float(), nullable=True))
    op.add_column("gestures", sa.Column("landmarks_path", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("gestures", "landmarks_path")
    op.drop_column("gestures", "end_ms")
    op.drop_column("gestures", "start_ms")
