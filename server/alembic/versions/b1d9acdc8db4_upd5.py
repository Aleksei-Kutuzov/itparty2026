"""upd5

Revision ID: b1d9acdc8db4
Revises: e0be2fc553d4
Create Date: 2026-03-09 12:07:39.652103

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "b1d9acdc8db4"
down_revision: Union[str, Sequence[str], None] = "e0be2fc553d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("users"):
        return

    columns = {column["name"] for column in inspector.get_columns("users")}
    if "is_admin" not in columns:
        op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    if "is_verified" not in columns:
        op.add_column("users", sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("users"):
        return

    columns = {column["name"] for column in inspector.get_columns("users")}
    if "is_verified" in columns:
        op.drop_column("users", "is_verified")
    if "is_admin" in columns:
        op.drop_column("users", "is_admin")
