"""create subscriptions table

Revision ID: 818ffff115bd
Revises: 6f21de80dbae
Create Date: 2026-03-08 14:43:15.239966

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '818ffff115bd'
down_revision: Union[str, Sequence[str], None] = '6f21de80dbae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
