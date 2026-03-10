"""upd9 subscriptions table

Revision ID: c6301141fe3c
Revises: 2b05f235577e
Create Date: 2026-03-08 15:44:56.908077

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c6301141fe3c'
down_revision: Union[str, Sequence[str], None] = '2b05f235577e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
