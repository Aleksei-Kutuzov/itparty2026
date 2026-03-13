"""add average percent to students

Revision ID: e1c6b6b0b7f2
Revises: d45b88a0f9c1
Create Date: 2026-03-13 12:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e1c6b6b0b7f2"
down_revision: Union[str, Sequence[str], None] = "d45b88a0f9c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("students", sa.Column("average_percent", sa.Float(), nullable=True))

    op.execute(
        """
        UPDATE students
        SET average_percent = (
            (
                COALESCE(informatics_avg_score, 0) +
                COALESCE(physics_avg_score, 0) +
                COALESCE(mathematics_avg_score, 0)
            ) /
            NULLIF(
                (CASE WHEN informatics_avg_score IS NOT NULL THEN 1 ELSE 0 END) +
                (CASE WHEN physics_avg_score IS NOT NULL THEN 1 ELSE 0 END) +
                (CASE WHEN mathematics_avg_score IS NOT NULL THEN 1 ELSE 0 END),
                0
            )
        ) * 20
        WHERE average_percent IS NULL
          AND (
            informatics_avg_score IS NOT NULL OR
            physics_avg_score IS NOT NULL OR
            mathematics_avg_score IS NOT NULL
          )
        """
    )


def downgrade() -> None:
    op.drop_column("students", "average_percent")
