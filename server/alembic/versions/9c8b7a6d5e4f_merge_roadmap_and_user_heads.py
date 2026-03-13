"""merge roadmap and user heads

Revision ID: 9c8b7a6d5e4f
Revises: 4b8f0f3b2a61, 7f2b1f4c8a10
Create Date: 2026-03-14 00:40:00.000000

"""
from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "9c8b7a6d5e4f"
down_revision: Union[str, Sequence[str], None] = ("4b8f0f3b2a61", "7f2b1f4c8a10")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
