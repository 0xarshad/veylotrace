from sqlalchemy.orm import Session

from app.models import ExpenseCategory

# Editable starting goals (stored per user in settings) — not statistics.
DEFAULT_TARGETS = {
    "calories": 2000,
    "protein_g": 100,
    "carbs_g": 250,
    "fat_g": 70,
    "fibre_g": 30,
    "water_ml": 2500,
    "steps": 8000,
    "sleep_hours": 8,
    "study_min": 60,
    "reading_min": 20,
    "workouts_per_week": 3,
}


ACTIVITY_FACTORS = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "very_active": 1.725}


def suggested_calories(sex_for_estimates: str, age_years: int, height_cm: float, weight_kg: float, activity_level: str) -> int:
    """Estimate adult maintenance calories with Mifflin–St Jeor and a selected activity factor."""
    resting = 10 * weight_kg + 6.25 * height_cm - 5 * age_years + (5 if sex_for_estimates == "male" else -161)
    return max(1200, round((resting * ACTIVITY_FACTORS[activity_level]) / 50) * 50)


def suggested_nutrition_targets(
    target_weight_kg: float, calories: float = DEFAULT_TARGETS["calories"], *,
    sex_for_estimates: str | None = None, age_years: int | None = None,
    height_cm: float | None = None, weight_kg: float | None = None, activity_level: str | None = None,
) -> dict[str, int]:
    """Editable adult starter macro goals; calorie estimates require the full profile."""
    if all(v is not None for v in (sex_for_estimates, age_years, height_cm, weight_kg, activity_level)):
        calories = suggested_calories(sex_for_estimates, age_years, height_cm, weight_kg, activity_level)
    protein = max(round(target_weight_kg * 0.8), round(calories * 0.10 / 4))
    remaining_kcal = max(calories - protein * 4, 0)
    goals = {
        "protein_g": protein,
        "carbs_g": round(remaining_kcal * 0.65 / 4),
        "fat_g": round(remaining_kcal * 0.35 / 9),
        "fibre_g": round(calories * 0.014),
    }
    if all(v is not None for v in (sex_for_estimates, age_years, height_cm, weight_kg, activity_level)):
        goals["calories"] = int(calories)
    return goals

DEFAULT_WIDGETS = [
    "daily_overview",
    "financial_overview",
    "health_overview",
    "productivity_overview",
    "lifestyle_overview",
    "spending_by_category",
    "budget_vs_actual",
]

DEFAULT_CATEGORY_TREE = {
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
    "Miscellaneous": ["Other"]
}


def seed_default_categories(db: Session, user_id: int) -> None:
    for name, children in DEFAULT_CATEGORY_TREE.items():
        parent = ExpenseCategory(user_id=user_id, name=name)
        db.add(parent)
        db.flush()
        db.add_all(ExpenseCategory(user_id=user_id, name=child, parent_id=parent.id) for child in children)
