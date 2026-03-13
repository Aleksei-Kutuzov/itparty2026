"""add responsible class to users

Revision ID: 4b8f0f3b2a61
Revises: e1c6b6b0b7f2
Create Date: 2026-03-13 15:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4b8f0f3b2a61"
down_revision: Union[str, Sequence[str], None] = "e1c6b6b0b7f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("responsible_class", sa.String(length=20), nullable=True))
    op.create_index(op.f("ix_users_responsible_class"), "users", ["responsible_class"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_responsible_class"), table_name="users")
    op.drop_column("users", "responsible_class")
