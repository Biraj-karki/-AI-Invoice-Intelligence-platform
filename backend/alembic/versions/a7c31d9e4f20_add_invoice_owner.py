"""give every invoice an owner

Revision ID: a7c31d9e4f20
Revises: c4be4fc460b5
Create Date: 2026-11-21 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c31d9e4f20'
down_revision: Union[str, Sequence[str], None] = 'c4be4fc460b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FK_NAME = 'fk_invoices_owner_id_users'
INDEX_NAME = 'ix_invoices_owner_id'


def upgrade() -> None:
    """Attach existing invoices to the original account, then require an owner."""
    # Nullable first, because the table already holds rows. NOT NULL can only be
    # enforced once every row has a value.
    op.add_column('invoices', sa.Column('owner_id', sa.Integer(), nullable=True))

    # Before ownership existed there was one workspace, so the oldest account is
    # the account those invoices belonged to. Rows are only touched if they are
    # still unowned (which, on a fresh table, is none of them).
    op.execute(
        """
        UPDATE invoices
        SET owner_id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1)
        WHERE owner_id IS NULL
        """
    )

    orphans = op.get_bind().execute(
        sa.text("SELECT count(*) FROM invoices WHERE owner_id IS NULL")
    ).scalar_one()
    if orphans:
        # Refuse instead of silently deleting data: someone must decide who owns
        # these invoices before the schema can promise isolation.
        raise RuntimeError(
            f"{orphans} invoice(s) have no account to own them. Create a user "
            "first, or set invoices.owner_id by hand, then run this migration "
            "again."
        )

    op.alter_column('invoices', 'owner_id', nullable=False)
    op.create_index(INDEX_NAME, 'invoices', ['owner_id'], unique=False)
    op.create_foreign_key(
        FK_NAME,
        'invoices',
        'users',
        ['owner_id'],
        ['id'],
        ondelete='CASCADE',
    )


def downgrade() -> None:
    """Drop ownership; invoices become shared again."""
    op.drop_constraint(FK_NAME, 'invoices', type_='foreignkey')
    op.drop_index(INDEX_NAME, table_name='invoices')
    op.drop_column('invoices', 'owner_id')
