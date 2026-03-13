"""add event environment fields

Revision ID: 7f2b1f4c8a10
Revises: d45b88a0f9c1
Create Date: 2026-03-14 13:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7f2b1f4c8a10"
down_revision: Union[str, Sequence[str], None] = "d45b88a0f9c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


event_environment_type = sa.Enum("real", "roadmap", name="event_environment_type")


def upgrade() -> None:
    bind = op.get_bind()
    event_environment_type.create(bind, checkfirst=True)

    op.add_column(
        "events",
        sa.Column("source_roadmap_event_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "events",
        sa.Column("environment_type", event_environment_type, nullable=False, server_default="real"),
    )
    op.add_column("events", sa.Column("roadmap_year", sa.Integer(), nullable=True))

    op.create_index(op.f("ix_events_source_roadmap_event_id"), "events", ["source_roadmap_event_id"], unique=False)
    op.create_index(op.f("ix_events_environment_type"), "events", ["environment_type"], unique=False)
    op.create_index(op.f("ix_events_roadmap_year"), "events", ["roadmap_year"], unique=False)
    op.create_foreign_key(
        "fk_events_source_roadmap_event_id",
        "events",
        "events",
        ["source_roadmap_event_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.alter_column("events", "environment_type", server_default=None)


def downgrade() -> None:
    op.drop_constraint("fk_events_source_roadmap_event_id", "events", type_="foreignkey")
    op.drop_index(op.f("ix_events_roadmap_year"), table_name="events")
    op.drop_index(op.f("ix_events_environment_type"), table_name="events")
    op.drop_index(op.f("ix_events_source_roadmap_event_id"), table_name="events")
    op.drop_column("events", "roadmap_year")
    op.drop_column("events", "environment_type")
    op.drop_column("events", "source_roadmap_event_id")

    bind = op.get_bind()
    event_environment_type.drop(bind, checkfirst=True)
