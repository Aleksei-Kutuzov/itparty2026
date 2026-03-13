"""add roadmap service models and event extensions

Revision ID: c3f91a61e8f4
Revises: b52dafe3c002
Create Date: 2026-03-12 21:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "c3f91a61e8f4"
down_revision: Union[str, Sequence[str], None] = "b52dafe3c002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ROADMAP_PROFESSIONAL = "PROFESSIONAL_EDUCATION"
ROADMAP_PRACTICE = "PRACTICE_ORIENTED"
ROADMAP_DIAGNOSTIC = "DIAGNOSTIC"
ROADMAP_PARENTS = "PARENTS"
ROADMAP_INFORMATIONAL = "INFORMATIONAL"

ROADMAP_ENUM_VALUES = [
    ROADMAP_PROFESSIONAL,
    ROADMAP_PRACTICE,
    ROADMAP_DIAGNOSTIC,
    ROADMAP_PARENTS,
    ROADMAP_INFORMATIONAL,
]

roadmap_direction_enum = postgresql.ENUM(*ROADMAP_ENUM_VALUES, name="roadmap_direction")
roadmap_direction_enum_ref = postgresql.ENUM(
    *ROADMAP_ENUM_VALUES,
    name="roadmap_direction",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    roadmap_direction_enum.create(bind, checkfirst=True)

    op.add_column(
        "events",
        sa.Column(
            "roadmap_direction",
            roadmap_direction_enum_ref,
            nullable=False,
            server_default=ROADMAP_PROFESSIONAL,
        ),
    )
    op.add_column("events", sa.Column("academic_year", sa.String(length=9), nullable=True))
    op.add_column("events", sa.Column("target_audience", sa.String(length=255), nullable=True))
    op.add_column("events", sa.Column("notes", sa.Text(), nullable=True))
    op.create_index(op.f("ix_events_roadmap_direction"), "events", ["roadmap_direction"], unique=False)
    op.create_index(op.f("ix_events_academic_year"), "events", ["academic_year"], unique=False)

    op.execute(
        """
        UPDATE events
        SET academic_year = CASE
            WHEN EXTRACT(MONTH FROM starts_at) >= 9
                THEN CONCAT(EXTRACT(YEAR FROM starts_at)::int, '/', (EXTRACT(YEAR FROM starts_at)::int + 1))
            ELSE CONCAT((EXTRACT(YEAR FROM starts_at)::int - 1), '/', EXTRACT(YEAR FROM starts_at)::int)
        END
        WHERE academic_year IS NULL
        """
    )
    op.alter_column("events", "academic_year", existing_type=sa.String(length=9), nullable=False)
    op.alter_column("events", "roadmap_direction", server_default=None)

    op.create_table(
        "event_responsibles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "user_id", name="uq_event_responsible"),
    )
    op.create_index(op.f("ix_event_responsibles_id"), "event_responsibles", ["id"], unique=False)
    op.create_index(op.f("ix_event_responsibles_event_id"), "event_responsibles", ["event_id"], unique=False)
    op.create_index(op.f("ix_event_responsibles_user_id"), "event_responsibles", ["user_id"], unique=False)

    op.create_table(
        "event_schedule_dates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "starts_at", "ends_at", name="uq_event_schedule_date"),
    )
    op.create_index(op.f("ix_event_schedule_dates_id"), "event_schedule_dates", ["id"], unique=False)
    op.create_index(op.f("ix_event_schedule_dates_event_id"), "event_schedule_dates", ["event_id"], unique=False)
    op.create_index(op.f("ix_event_schedule_dates_starts_at"), "event_schedule_dates", ["starts_at"], unique=False)

    op.create_table(
        "student_achievements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=True),
        sa.Column("event_name", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("achievement", sa.String(length=255), nullable=False),
        sa.Column("achievement_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_student_achievements_id"), "student_achievements", ["id"], unique=False)
    op.create_index(op.f("ix_student_achievements_student_id"), "student_achievements", ["student_id"], unique=False)
    op.create_index(op.f("ix_student_achievements_event_id"), "student_achievements", ["event_id"], unique=False)
    op.create_index(op.f("ix_student_achievements_event_type"), "student_achievements", ["event_type"], unique=False)
    op.create_index(
        op.f("ix_student_achievements_achievement_date"),
        "student_achievements",
        ["achievement_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_student_achievements_achievement_date"), table_name="student_achievements")
    op.drop_index(op.f("ix_student_achievements_event_type"), table_name="student_achievements")
    op.drop_index(op.f("ix_student_achievements_event_id"), table_name="student_achievements")
    op.drop_index(op.f("ix_student_achievements_student_id"), table_name="student_achievements")
    op.drop_index(op.f("ix_student_achievements_id"), table_name="student_achievements")
    op.drop_table("student_achievements")

    op.drop_index(op.f("ix_event_schedule_dates_starts_at"), table_name="event_schedule_dates")
    op.drop_index(op.f("ix_event_schedule_dates_event_id"), table_name="event_schedule_dates")
    op.drop_index(op.f("ix_event_schedule_dates_id"), table_name="event_schedule_dates")
    op.drop_table("event_schedule_dates")

    op.drop_index(op.f("ix_event_responsibles_user_id"), table_name="event_responsibles")
    op.drop_index(op.f("ix_event_responsibles_event_id"), table_name="event_responsibles")
    op.drop_index(op.f("ix_event_responsibles_id"), table_name="event_responsibles")
    op.drop_table("event_responsibles")

    op.drop_index(op.f("ix_events_academic_year"), table_name="events")
    op.drop_index(op.f("ix_events_roadmap_direction"), table_name="events")
    op.drop_column("events", "notes")
    op.drop_column("events", "target_audience")
    op.drop_column("events", "academic_year")
    op.drop_column("events", "roadmap_direction")

    bind = op.get_bind()
    roadmap_direction_enum.drop(bind, checkfirst=True)
