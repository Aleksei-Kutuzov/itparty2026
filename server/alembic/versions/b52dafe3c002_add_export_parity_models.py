"""add export parity models for simplater

Revision ID: b52dafe3c002
Revises: a9c4d4b8f001
Create Date: 2026-03-12 15:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b52dafe3c002"
down_revision: Union[str, Sequence[str], None] = "a9c4d4b8f001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "class_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("class_name", sa.String(length=20), nullable=False),
        sa.Column("formation_year", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "class_name", name="uq_class_profile_org_class"),
    )
    op.create_index(op.f("ix_class_profiles_id"), "class_profiles", ["id"], unique=False)
    op.create_index(op.f("ix_class_profiles_organization_id"), "class_profiles", ["organization_id"], unique=False)
    op.create_index(op.f("ix_class_profiles_class_name"), "class_profiles", ["class_name"], unique=False)

    op.add_column("students", sa.Column("class_profile_id", sa.Integer(), nullable=True))
    op.add_column("students", sa.Column("informatics_avg_score", sa.Float(), nullable=True))
    op.add_column("students", sa.Column("physics_avg_score", sa.Float(), nullable=True))
    op.add_column("students", sa.Column("mathematics_avg_score", sa.Float(), nullable=True))
    op.create_index(op.f("ix_students_class_profile_id"), "students", ["class_profile_id"], unique=False)
    op.create_foreign_key(
        "fk_students_class_profile_id_class_profiles",
        "students",
        "class_profiles",
        ["class_profile_id"],
        ["id"],
    )

    op.add_column("events", sa.Column("target_class_name", sa.String(length=20), nullable=True))
    op.add_column("events", sa.Column("organizer", sa.String(length=255), nullable=True))
    op.add_column("events", sa.Column("event_level", sa.String(length=100), nullable=True))
    op.add_column("events", sa.Column("event_format", sa.String(length=100), nullable=True))
    op.add_column("events", sa.Column("participants_count", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_events_target_class_name"), "events", ["target_class_name"], unique=False)

    op.add_column("participations", sa.Column("status", sa.String(length=100), nullable=True))

    op.create_table(
        "student_research_works",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("work_title", sa.String(length=500), nullable=False),
        sa.Column("publication_or_presentation_place", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_student_research_works_id"), "student_research_works", ["id"], unique=False)
    op.create_index(
        op.f("ix_student_research_works_student_id"),
        "student_research_works",
        ["student_id"],
        unique=False,
    )

    op.create_table(
        "student_additional_education",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("program_name", sa.String(length=255), nullable=False),
        sa.Column("provider_organization", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_student_additional_education_id"), "student_additional_education", ["id"], unique=False)
    op.create_index(
        op.f("ix_student_additional_education_student_id"),
        "student_additional_education",
        ["student_id"],
        unique=False,
    )

    op.create_table(
        "student_first_professions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("educational_organization", sa.String(length=255), nullable=False),
        sa.Column("training_program", sa.String(length=255), nullable=False),
        sa.Column("study_period", sa.String(length=100), nullable=False),
        sa.Column("document", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_student_first_professions_id"), "student_first_professions", ["id"], unique=False)
    op.create_index(
        op.f("ix_student_first_professions_student_id"),
        "student_first_professions",
        ["student_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_student_first_professions_student_id"), table_name="student_first_professions")
    op.drop_index(op.f("ix_student_first_professions_id"), table_name="student_first_professions")
    op.drop_table("student_first_professions")

    op.drop_index(op.f("ix_student_additional_education_student_id"), table_name="student_additional_education")
    op.drop_index(op.f("ix_student_additional_education_id"), table_name="student_additional_education")
    op.drop_table("student_additional_education")

    op.drop_index(op.f("ix_student_research_works_student_id"), table_name="student_research_works")
    op.drop_index(op.f("ix_student_research_works_id"), table_name="student_research_works")
    op.drop_table("student_research_works")

    op.drop_column("participations", "status")

    op.drop_index(op.f("ix_events_target_class_name"), table_name="events")
    op.drop_column("events", "participants_count")
    op.drop_column("events", "event_format")
    op.drop_column("events", "event_level")
    op.drop_column("events", "organizer")
    op.drop_column("events", "target_class_name")

    op.drop_constraint("fk_students_class_profile_id_class_profiles", "students", type_="foreignkey")
    op.drop_index(op.f("ix_students_class_profile_id"), table_name="students")
    op.drop_column("students", "mathematics_avg_score")
    op.drop_column("students", "physics_avg_score")
    op.drop_column("students", "informatics_avg_score")
    op.drop_column("students", "class_profile_id")

    op.drop_index(op.f("ix_class_profiles_class_name"), table_name="class_profiles")
    op.drop_index(op.f("ix_class_profiles_organization_id"), table_name="class_profiles")
    op.drop_index(op.f("ix_class_profiles_id"), table_name="class_profiles")
    op.drop_table("class_profiles")
