"""upd

Revision ID: 0ed101e187dd
Revises: c6165bbed3bf
Create Date: 2026-03-08 16:20:29.744390

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "0ed101e187dd"
down_revision: Union[str, Sequence[str], None] = "c6165bbed3bf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: add unique constraint to name column."""
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("subscriptions"):
        return

    columns = {column["name"] for column in inspector.get_columns("subscriptions")}
    if "name" not in columns:
        return

    unique_constraints = inspector.get_unique_constraints("subscriptions")
    if any((constraint.get("column_names") or []) == ["name"] for constraint in unique_constraints):
        return

    op.create_unique_constraint("uq_subscriptions_name", "subscriptions", ["name"])


def downgrade() -> None:
    """Downgrade schema: remove unique constraint from name column."""
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("subscriptions"):
        return

    unique_constraints = {constraint["name"] for constraint in inspector.get_unique_constraints("subscriptions")}
    if "uq_subscriptions_name" not in unique_constraints:
        return

    op.drop_constraint("uq_subscriptions_name", "subscriptions", type_="unique")
