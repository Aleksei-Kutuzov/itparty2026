"""upd subscriptions table

Revision ID: 2b05f235577e
Revises: 818ffff115bd
Create Date: 2026-03-08 15:23:52.977053

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2b05f235577e'
down_revision: Union[str, Sequence[str], None] = '818ffff115bd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
