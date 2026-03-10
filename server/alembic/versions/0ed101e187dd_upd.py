"""upd

Revision ID: 0ed101e187dd
Revises: c6165bbed3bf
Create Date: 2026-03-08 16:20:29.744390

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0ed101e187dd'
down_revision: Union[str, Sequence[str], None] = 'c6165bbed3bf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: add unique constraint to name column."""
    op.create_unique_constraint(
        'uq_subscriptions_name',  # Имя ограничения
        'subscriptions',         # Таблица
        ['name']                # Столбец(ы)
    )

def downgrade() -> None:
    """Downgrade schema: remove unique constraint from name column."""
    op.drop_constraint(
        'uq_subscriptions_name',  # Имя ограничения
        'subscriptions',          # Таблица
        type_='unique'
    )
