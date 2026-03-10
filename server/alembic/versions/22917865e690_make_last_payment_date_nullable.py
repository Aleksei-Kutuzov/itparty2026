"""make last_payment_date nullable

Revision ID: 22917865e690
Revises: c6301141fe3c
Create Date: 2026-03-08 16:06:49.333851

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '22917865e690'
down_revision: Union[str, Sequence[str], None] = 'c6301141fe3c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
