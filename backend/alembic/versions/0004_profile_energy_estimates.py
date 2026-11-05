"""Store sex, age and activity inputs for nutrition estimates.

Revision ID: 0004
Revises: 0003
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.add_column(sa.Column("sex_for_estimates", sa.String(length=8), nullable=True))
        batch_op.add_column(sa.Column("age_years", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("activity_level", sa.String(length=16), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.drop_column("activity_level")
        batch_op.drop_column("age_years")
        batch_op.drop_column("sex_for_estimates")
