"""merge staff profile fields into users

Revision ID: d7a44c8e1f20
Revises: ba44e69230e4
Create Date: 2026-03-12 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7a44c8e1f20'
down_revision: Union[str, Sequence[str], None] = 'ba44e69230e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('organization_id', sa.Integer(), nullable=True))
    op.add_column('users', sa.Column('position', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_users_organization_id'), 'users', ['organization_id'], unique=False)
    op.create_foreign_key(
        'fk_users_organization_id_organizations',
        'users',
        'organizations',
        ['organization_id'],
        ['id'],
    )
    op.drop_table('staff_profiles')


def downgrade() -> None:
    """Downgrade schema."""
    op.create_table(
        'staff_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
    )
    op.create_index(op.f('ix_staff_profiles_id'), 'staff_profiles', ['id'], unique=False)
    op.create_index(op.f('ix_staff_profiles_organization_id'), 'staff_profiles', ['organization_id'], unique=False)
    op.create_index(op.f('ix_staff_profiles_user_id'), 'staff_profiles', ['user_id'], unique=True)

    op.drop_constraint('fk_users_organization_id_organizations', 'users', type_='foreignkey')
    op.drop_index(op.f('ix_users_organization_id'), table_name='users')
    op.drop_column('users', 'position')
    op.drop_column('users', 'organization_id')
