"""add invoice duplicate detection fields

Revision ID: f61e2a8c9d30
Revises: a7c31d9e4f20
Create Date: 2026-11-21 13:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f61e2a8c9d30"
down_revision: Union[str, Sequence[str], None] = "a7c31d9e4f20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("content_hash", sa.String(length=64)))
    op.add_column("invoices", sa.Column("duplicate_of_id", sa.Integer(), nullable=True))
    op.add_column("invoices", sa.Column("duplicate_match", sa.String(length=32)))
    op.create_index(
        "ix_invoices_owner_content_hash",
        "invoices",
        ["owner_id", "content_hash"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_invoices_duplicate_of_id_invoices",
        "invoices",
        "invoices",
        ["duplicate_of_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_invoices_duplicate_of_id_invoices",
        "invoices",
        type_="foreignkey",
    )
    op.drop_index("ix_invoices_owner_content_hash", table_name="invoices")
    op.drop_column("invoices", "duplicate_match")
    op.drop_column("invoices", "duplicate_of_id")
    op.drop_column("invoices", "content_hash")
