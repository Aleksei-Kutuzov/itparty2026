"""upd2

Revision ID: 840826748dd7
Revises: 0ed101e187dd
Create Date: 2026-03-08 16:24:27.201304

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "840826748dd7"
down_revision: Union[str, Sequence[str], None] = "0ed101e187dd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("subscriptions"):
        return

    columns = {column["name"] for column in inspector.get_columns("subscriptions")}
    if "last_payment_date" in columns:
        op.alter_column(
            "subscriptions",
            "last_payment_date",
            existing_type=postgresql.TIMESTAMP(),
            type_=sa.DateTime(timezone=True),
            existing_nullable=True,
        )
    if "next_payment_date" in columns:
        op.alter_column(
            "subscriptions",
            "next_payment_date",
            existing_type=postgresql.TIMESTAMP(),
            type_=sa.DateTime(timezone=True),
            existing_nullable=False,
        )

    unique_constraints = inspector.get_unique_constraints("subscriptions")
    if not any((constraint.get("column_names") or []) == ["name"] for constraint in unique_constraints):
        op.create_unique_constraint("uq_subscriptions_name_840826748dd7", "subscriptions", ["name"])


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("subscriptions"):
        return

    unique_constraints = {constraint["name"] for constraint in inspector.get_unique_constraints("subscriptions")}
    if "uq_subscriptions_name_840826748dd7" in unique_constraints:
        op.drop_constraint("uq_subscriptions_name_840826748dd7", "subscriptions", type_="unique")

    columns = {column["name"] for column in inspector.get_columns("subscriptions")}
    if "next_payment_date" in columns:
        op.alter_column(
            "subscriptions",
            "next_payment_date",
            existing_type=sa.DateTime(timezone=True),
            type_=postgresql.TIMESTAMP(),
            existing_nullable=False,
        )
    if "last_payment_date" in columns:
        op.alter_column(
            "subscriptions",
            "last_payment_date",
            existing_type=sa.DateTime(timezone=True),
            type_=postgresql.TIMESTAMP(),
            existing_nullable=True,
        )
