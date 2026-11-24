"""track where each invoice PDF is stored

Revision ID: aa412870fc9b
Revises: c830bf49ad21
Create Date: 2026-11-21 14:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "aa412870fc9b"
down_revision: Union[str, Sequence[str], None] = "c830bf49ad21"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "invoices",
        sa.Column(
            "storage_provider",
            sa.String(length=32),
            server_default="local",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("invoices", "storage_provider")
