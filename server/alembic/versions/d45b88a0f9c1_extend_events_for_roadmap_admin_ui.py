"""extend events for roadmap admin ui

Revision ID: d45b88a0f9c1
Revises: c3f91a61e8f4
Create Date: 2026-03-13 10:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d45b88a0f9c1"
down_revision: Union[str, Sequence[str], None] = "c3f91a61e8f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("schedule_mode", sa.String(length=30), nullable=False, server_default="range"),
    )
    op.add_column(
        "events",
        sa.Column("is_all_organizations", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("events", sa.Column("target_class_names", sa.Text(), nullable=True))

    op.alter_column("events", "schedule_mode", server_default=None)
    op.alter_column("events", "is_all_organizations", server_default=None)


def downgrade() -> None:
    op.drop_column("events", "target_class_names")
    op.drop_column("events", "is_all_organizations")
    op.drop_column("events", "schedule_mode")
