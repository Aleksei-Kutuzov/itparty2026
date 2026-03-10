"""sync with existing schema

Revision ID: e0be2fc553d4
Revises: 840826748dd7
Create Date: 2026-03-09 12:03:41.842648

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e0be2fc553d4'
down_revision: Union[str, Sequence[str], None] = '840826748dd7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
