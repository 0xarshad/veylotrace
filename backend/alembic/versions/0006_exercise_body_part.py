"""Store the parent body part for exercise categories.

Revision ID: 0006
Revises: 0005
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("exercise_entries") as batch_op:
        batch_op.add_column(sa.Column("body_part", sa.String(length=60), nullable=False, server_default=""))


def downgrade() -> None:
    with op.batch_alter_table("exercise_entries") as batch_op:
        batch_op.drop_column("body_part")
