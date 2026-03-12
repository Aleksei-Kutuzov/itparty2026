"""make last_payment_date nullable

Revision ID: e4b61836dcca
Revises: 22917865e690
Create Date: 2026-03-08 16:07:45.614761

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'e4b61836dcca'
down_revision: Union[str, Sequence[str], None] = '22917865e690'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ensure_subscriptions_table() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("subscriptions"):
        return

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("cost", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("billing_cycle", sa.VARCHAR(length=20), nullable=False, server_default="month"),
        sa.Column("last_payment_date", sa.DateTime(timezone=False), nullable=False),
        sa.Column("next_payment_date", sa.DateTime(timezone=False), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_subscriptions_id"), "subscriptions", ["id"], unique=False)


def upgrade() -> None:
    """Upgrade schema: make last_payment_date nullable."""
    _ensure_subscriptions_table()

    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("subscriptions")}
    if "last_payment_date" not in columns:
        return

    op.alter_column("subscriptions", "last_payment_date", nullable=True)

def downgrade() -> None:
    """Downgrade schema: revert last_payment_date to NOT NULL."""
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("subscriptions"):
        return

    columns = {column["name"] for column in inspector.get_columns("subscriptions")}
    if "last_payment_date" not in columns:
        return

    op.alter_column("subscriptions", "last_payment_date", nullable=False)

