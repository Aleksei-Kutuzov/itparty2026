"""make last_payment_date nullable

Revision ID: e4b61836dcca
Revises: 22917865e690
Create Date: 2026-03-08 16:07:45.614761

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4b61836dcca'
down_revision: Union[str, Sequence[str], None] = '22917865e690'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: make last_payment_date nullable."""
    op.alter_column(
        'subscriptions',
        'last_payment_date',
        nullable=True
    )

def downgrade() -> None:
    """Downgrade schema: revert last_payment_date to NOT NULL."""
    op.alter_column(
        'subscriptions',
        'last_payment_date',
        nullable=False
    )

