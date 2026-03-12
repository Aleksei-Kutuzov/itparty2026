"""create subscriptions table

Revision ID: 818ffff115bd
Revises: 6f21de80dbae
Create Date: 2026-03-08 14:43:15.239966

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '818ffff115bd'
down_revision: Union[str, Sequence[str], None] = '6f21de80dbae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
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


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("subscriptions"):
        return

    indexes = {index["name"] for index in inspector.get_indexes("subscriptions")}
    index_name = op.f("ix_subscriptions_id")
    if index_name in indexes:
        op.drop_index(index_name, table_name="subscriptions")
    op.drop_table("subscriptions")
