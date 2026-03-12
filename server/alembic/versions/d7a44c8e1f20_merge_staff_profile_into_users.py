"""merge staff profile fields into users

Revision ID: d7a44c8e1f20
Revises: ba44e69230e4
Create Date: 2026-03-12 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "d7a44c8e1f20"
down_revision: Union[str, Sequence[str], None] = "ba44e69230e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_fk(inspector, table_name: str, fk_name: str) -> bool:
    return any(fk.get("name") == fk_name for fk in inspector.get_foreign_keys(table_name))


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("users"):
        return

    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "organization_id" not in user_columns:
        op.add_column("users", sa.Column("organization_id", sa.Integer(), nullable=True))
    if "position" not in user_columns:
        op.add_column("users", sa.Column("position", sa.String(length=255), nullable=True))

    # refresh after potential ALTER TABLE operations
    inspector = inspect(bind)
    user_indexes = {index["name"] for index in inspector.get_indexes("users")}
    index_name = op.f("ix_users_organization_id")
    if index_name not in user_indexes:
        op.create_index(index_name, "users", ["organization_id"], unique=False)

    fk_name = "fk_users_organization_id_organizations"
    if inspector.has_table("organizations") and not _has_fk(inspector, "users", fk_name):
        op.create_foreign_key(
            fk_name,
            "users",
            "organizations",
            ["organization_id"],
            ["id"],
        )

    if inspector.has_table("staff_profiles"):
        op.drop_table("staff_profiles")


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("staff_profiles"):
        op.create_table(
            "staff_profiles",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("organization_id", sa.Integer(), nullable=False),
            sa.Column("position", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id"),
        )
        op.create_index(op.f("ix_staff_profiles_id"), "staff_profiles", ["id"], unique=False)
        op.create_index(op.f("ix_staff_profiles_organization_id"), "staff_profiles", ["organization_id"], unique=False)
        op.create_index(op.f("ix_staff_profiles_user_id"), "staff_profiles", ["user_id"], unique=True)

    if inspector.has_table("users"):
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        fk_name = "fk_users_organization_id_organizations"
        if _has_fk(inspector, "users", fk_name):
            op.drop_constraint(fk_name, "users", type_="foreignkey")

        user_indexes = {index["name"] for index in inspector.get_indexes("users")}
        index_name = op.f("ix_users_organization_id")
        if index_name in user_indexes:
            op.drop_index(index_name, table_name="users")

        if "position" in user_columns:
            op.drop_column("users", "position")
        if "organization_id" in user_columns:
            op.drop_column("users", "organization_id")
