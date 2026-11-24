"""add a revocable automation token per account

Revision ID: c830bf49ad21
Revises: f61e2a8c9d30
Create Date: 2026-11-21 13:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c830bf49ad21"
down_revision: Union[str, Sequence[str], None] = "f61e2a8c9d30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("automation_token_hash", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_users_automation_token_hash",
        "users",
        ["automation_token_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_users_automation_token_hash", table_name="users")
    op.drop_column("users", "automation_token_hash")
