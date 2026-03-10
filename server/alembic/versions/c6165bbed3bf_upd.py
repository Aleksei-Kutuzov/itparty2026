"""upd

Revision ID: c6165bbed3bf
Revises: e4b61836dcca
Create Date: 2026-03-08 16:19:54.107394

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c6165bbed3bf'
down_revision: Union[str, Sequence[str], None] = 'e4b61836dcca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
