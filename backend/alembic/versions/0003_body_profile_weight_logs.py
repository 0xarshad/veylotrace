"""Store body profile measurements and weight history.

Revision ID: 0003
Revises: 0002
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.add_column(sa.Column("height_cm", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("starting_weight_kg", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("body_fat_percent", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("target_weight_kg", sa.Float(), nullable=True))

    op.create_table(
        "weight_logs",
        sa.Column("log_date", sa.Date(), nullable=False),
        sa.Column("weight_kg", sa.Float(), nullable=False),
        sa.Column("body_fat_percent", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_weight_logs_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_weight_logs")),
    )
    with op.batch_alter_table("weight_logs") as batch_op:
        batch_op.create_index(op.f("ix_weight_logs_deleted_at"), ["deleted_at"], unique=False)
        batch_op.create_index(op.f("ix_weight_logs_user_id"), ["user_id"], unique=False)
        batch_op.create_index(op.f("ix_weight_logs_log_date"), ["log_date"], unique=False)


def downgrade() -> None:
    op.drop_table("weight_logs")
    with op.batch_alter_table("user_settings") as batch_op:
        batch_op.drop_column("target_weight_kg")
        batch_op.drop_column("body_fat_percent")
        batch_op.drop_column("starting_weight_kg")
        batch_op.drop_column("height_cm")
