"""Expand each user's starter expense categories into a useful category tree.

Revision ID: 0002
Revises: 0001
"""
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CATEGORY_TREE = {
    "Housing & Bills": ["Rent & mortgage", "Utilities", "Internet & phone", "Home supplies", "Repairs"],
    "Food & Dining": ["Groceries", "Restaurants", "Takeaway & delivery", "Coffee & snacks"],
    "Transport": ["Public transport", "Fuel", "Taxi & ride-share", "Vehicle maintenance", "Parking & tolls"],
    "Health & Wellness": ["Medical care", "Pharmacy", "Fitness", "Health insurance"],
    "Shopping & Personal": ["Clothing", "Electronics", "Household items", "Personal care"],
    "Education & Work": ["Courses & tuition", "Books & stationery", "Work expenses"],
    "Entertainment": ["Streaming", "Events", "Games & hobbies"],
    "Travel": ["Flights & trains", "Accommodation", "Local transport", "Activities"],
    "Family & Pets": ["Childcare", "Pet care", "Family support"],
    "Finance & Giving": ["Insurance", "Bank fees", "Taxes", "Gifts & donations"],
    "Miscellaneous": ["Other"],
}


def upgrade() -> None:
    bind = op.get_bind()
    categories = sa.table(
        "expense_categories",
        sa.column("id", sa.Integer), sa.column("user_id", sa.Integer), sa.column("name", sa.String),
        sa.column("parent_id", sa.Integer), sa.column("deleted_at", sa.DateTime),
        sa.column("created_at", sa.DateTime), sa.column("updated_at", sa.DateTime),
    )
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    user_ids = bind.execute(sa.text("SELECT id FROM users")).scalars().all()
    for user_id in user_ids:
        rows = bind.execute(sa.select(categories).where(categories.c.user_id == user_id)).mappings().all()
        roots = {row["name"].casefold(): row for row in rows if row["parent_id"] is None and row["deleted_at"] is None}

        # Preserve existing expense and budget references by renaming the old
        # starter category in place when there is no category with the new name.
        old_food = roots.get("food")
        if old_food and "food & dining" not in roots:
            bind.execute(sa.update(categories).where(categories.c.id == old_food["id"]).values(name="Food & Dining", updated_at=now))
            roots["food & dining"] = {**old_food, "name": "Food & Dining"}

        for name in CATEGORY_TREE:
            if name.casefold() not in roots:
                bind.execute(sa.insert(categories).values(user_id=user_id, name=name, parent_id=None, deleted_at=None, created_at=now, updated_at=now))
                parent_id = bind.execute(
                    sa.select(categories.c.id).where(
                        categories.c.user_id == user_id,
                        categories.c.name == name,
                        categories.c.parent_id.is_(None),
                        categories.c.deleted_at.is_(None),
                    ).order_by(categories.c.id.desc()).limit(1)
                ).scalar_one()
                roots[name.casefold()] = {"id": parent_id, "name": name}
            else:
                parent_id = roots[name.casefold()]["id"]

            children = {row["name"].casefold() for row in rows if row["parent_id"] == parent_id and row["deleted_at"] is None}
            for child in CATEGORY_TREE[name]:
                if child.casefold() not in children:
                    bind.execute(sa.insert(categories).values(user_id=user_id, name=child, parent_id=parent_id, deleted_at=None, created_at=now, updated_at=now))


def downgrade() -> None:
    # Keep category records and historical expense/budget references intact.
    pass
