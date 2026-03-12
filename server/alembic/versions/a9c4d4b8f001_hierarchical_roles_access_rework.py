"""hierarchical roles and access rework

Revision ID: a9c4d4b8f001
Revises: d7a44c8e1f20
Create Date: 2026-03-12 13:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a9c4d4b8f001"
down_revision: Union[str, Sequence[str], None] = "d7a44c8e1f20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


user_role_enum = sa.Enum("admin", "organization", "curator", name="user_role", create_type=False)
approval_status_enum = sa.Enum("pending", "approved", "rejected", name="approval_status", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    user_role_enum.create(bind, checkfirst=True)
    approval_status_enum.create(bind, checkfirst=True)

    op.add_column(
        "users",
        sa.Column("role", user_role_enum, nullable=False, server_default="curator"),
    )
    op.add_column(
        "users",
        sa.Column("approval_status", approval_status_enum, nullable=False, server_default="pending"),
    )
    op.add_column("users", sa.Column("approved_by_user_id", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))

    op.execute("UPDATE users SET role = 'admin' WHERE is_admin = TRUE")
    op.execute("UPDATE users SET role = 'curator' WHERE is_admin = FALSE")
    op.execute("UPDATE users SET approval_status = 'approved' WHERE is_verified = TRUE")
    op.execute("UPDATE users SET approval_status = 'pending' WHERE is_verified = FALSE")

    op.drop_column("users", "is_admin")
    op.drop_column("users", "is_verified")

    op.execute("DROP TABLE IF EXISTS participations CASCADE")
    op.execute("DROP TABLE IF EXISTS event_students CASCADE")
    op.execute("DROP TABLE IF EXISTS event_feedback CASCADE")
    op.execute("DROP TABLE IF EXISTS events CASCADE")
    op.execute("DROP TABLE IF EXISTS students CASCADE")
    op.execute("DROP TABLE IF EXISTS organizations CASCADE")

    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("approval_status", approval_status_enum, nullable=False, server_default="pending"),
        sa.Column("approved_by_user_id", sa.Integer(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["users.id"]),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("owner_user_id"),
    )
    op.create_index(op.f("ix_organizations_id"), "organizations", ["id"], unique=False)
    op.create_index(op.f("ix_organizations_name"), "organizations", ["name"], unique=False)
    op.create_index(op.f("ix_organizations_approval_status"), "organizations", ["approval_status"], unique=False)

    op.execute("UPDATE users SET organization_id = NULL")

    op.create_foreign_key(
        "fk_users_organization_id_organizations",
        "users",
        "organizations",
        ["organization_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_users_approved_by_user_id_users",
        "users",
        "users",
        ["approved_by_user_id"],
        ["id"],
    )
    op.create_index(op.f("ix_users_role"), "users", ["role"], unique=False)
    op.create_index(op.f("ix_users_approval_status"), "users", ["approval_status"], unique=False)
    op.create_index(op.f("ix_users_approved_by_user_id"), "users", ["approved_by_user_id"], unique=False)

    op.create_table(
        "students",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("curator_id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("school_class", sa.String(length=20), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["curator_id"], ["users.id"]),
    )
    op.create_index(op.f("ix_students_id"), "students", ["id"], unique=False)
    op.create_index(op.f("ix_students_organization_id"), "students", ["organization_id"], unique=False)
    op.create_index(op.f("ix_students_curator_id"), "students", ["curator_id"], unique=False)
    op.create_index(op.f("ix_students_full_name"), "students", ["full_name"], unique=False)
    op.create_index(op.f("ix_students_school_class"), "students", ["school_class"], unique=False)

    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
    )
    op.create_index(op.f("ix_events_id"), "events", ["id"], unique=False)
    op.create_index(op.f("ix_events_organization_id"), "events", ["organization_id"], unique=False)
    op.create_index(op.f("ix_events_created_by_user_id"), "events", ["created_by_user_id"], unique=False)
    op.create_index(op.f("ix_events_event_type"), "events", ["event_type"], unique=False)
    op.create_index(op.f("ix_events_starts_at"), "events", ["starts_at"], unique=False)
    op.create_index(op.f("ix_events_ends_at"), "events", ["ends_at"], unique=False)

    op.create_table(
        "participations",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("recorded_by_user_id", sa.Integer(), nullable=False),
        sa.Column("participation_type", sa.String(length=50), nullable=False),
        sa.Column("result", sa.String(length=100), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("award_place", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"]),
        sa.ForeignKeyConstraint(["recorded_by_user_id"], ["users.id"]),
        sa.UniqueConstraint("student_id", "event_id", name="uq_participation_student_event"),
    )
    op.create_index(op.f("ix_participations_id"), "participations", ["id"], unique=False)
    op.create_index(op.f("ix_participations_student_id"), "participations", ["student_id"], unique=False)
    op.create_index(op.f("ix_participations_event_id"), "participations", ["event_id"], unique=False)
    op.create_index(op.f("ix_participations_recorded_by_user_id"), "participations", ["recorded_by_user_id"], unique=False)
    op.create_index(op.f("ix_participations_participation_type"), "participations", ["participation_type"], unique=False)


def downgrade() -> None:
    op.drop_table("participations")
    op.drop_table("events")
    op.drop_table("students")
    op.drop_table("organizations")

    op.drop_index(op.f("ix_users_approved_by_user_id"), table_name="users")
    op.drop_index(op.f("ix_users_approval_status"), table_name="users")
    op.drop_index(op.f("ix_users_role"), table_name="users")
    op.drop_constraint("fk_users_approved_by_user_id_users", "users", type_="foreignkey")
    op.drop_constraint("fk_users_organization_id_organizations", "users", type_="foreignkey")
    op.drop_column("users", "approved_at")
    op.drop_column("users", "approved_by_user_id")
    op.drop_column("users", "approval_status")
    op.drop_column("users", "role")

    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("users", sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")))

    bind = op.get_bind()
    user_role_enum.drop(bind, checkfirst=True)
    approval_status_enum.drop(bind, checkfirst=True)
