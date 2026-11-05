"""Request/response schemas for tracking modules."""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, computed_field, create_model, model_validator

Money = Annotated[Decimal, PlainSerializer(lambda v: float(v), return_type=float, when_used="json")]
Amount = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]
Text = Annotated[str, Field(max_length=4000)]
Short = Annotated[str, Field(max_length=255)]
NonNeg = Annotated[float, Field(ge=0, le=10_000_000)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid", str_strip_whitespace=True)


class OutBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


def make_update(create_cls: type[BaseModel], name: str) -> type[BaseModel]:
    """All-optional copy of a create schema (field constraints preserved) used for partial updates."""
    fields = {}
    for fname, info in create_cls.model_fields.items():
        ann = Annotated[(info.annotation, *info.metadata)] if info.metadata else info.annotation
        fields[fname] = (Optional[ann], None)
    return create_model(name, __base__=ORM, **fields)


# ---------------- Finance ----------------
PAYMENT = Literal["cash", "card", "upi", "bank", "wallet", "other"]


class CategoryIn(ORM):
    name: Annotated[str, Field(min_length=1, max_length=80)]
    parent_id: int | None = None


class CategoryOut(OutBase):
    name: str
    parent_id: int | None


class ExpenseIn(ORM):
    occurred_at: datetime
    amount: Amount
    category_id: int | None = None
    subcategory_id: int | None = None
    description: Short = ""
    payment_method: PAYMENT = "other"
    necessity: Literal["essential", "non_essential"] = "essential"
    notes: Text = ""


class ExpenseOut(OutBase):
    occurred_at: datetime
    amount: Money
    category_id: int | None
    subcategory_id: int | None
    description: str
    payment_method: str
    necessity: str
    notes: str


class IncomeIn(ORM):
    occurred_at: datetime
    amount: Amount
    source_type: Literal["salary", "freelance", "business", "reimbursement", "other"] = "salary"
    description: Short = ""
    notes: Text = ""


class IncomeOut(OutBase):
    occurred_at: datetime
    amount: Money
    source_type: str
    description: str
    notes: str


class TransferIn(ORM):
    occurred_at: datetime
    amount: Amount
    from_account: Annotated[str, Field(min_length=1, max_length=80)]
    to_account: Annotated[str, Field(min_length=1, max_length=80)]
    notes: Text = ""

    @model_validator(mode="after")
    def _diff(self):
        if self.from_account.strip().lower() == self.to_account.strip().lower():
            raise ValueError("Source and destination accounts must differ.")
        return self


class TransferOut(OutBase):
    occurred_at: datetime
    amount: Money
    from_account: str
    to_account: str
    notes: str


class BudgetIn(ORM):
    period: Literal["daily", "weekly", "monthly", "custom"]
    amount: Amount
    category_id: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    name: Annotated[str, Field(max_length=100)] = ""


class BudgetOut(OutBase):
    period: str
    amount: Money
    category_id: int | None
    start_date: date | None
    end_date: date | None
    name: str


class SavingsGoalIn(ORM):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    target_amount: Amount
    target_date: date | None = None
    planned_monthly_contribution: Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)] = Decimal(0)
    notes: Text = ""


class SavingsGoalOut(OutBase):
    name: str
    target_amount: Money
    target_date: date | None
    planned_monthly_contribution: Money
    notes: str
    contributed: float = 0
    remaining: float = 0
    progress_pct: float = 0
    projected_completion: date | None = None


class ContributionIn(ORM):
    occurred_at: datetime
    amount: Amount
    goal_id: int | None = None
    notes: Text = ""


class ContributionOut(OutBase):
    occurred_at: datetime
    amount: Money
    goal_id: int | None
    notes: str


# ---------------- Health ----------------
class ExerciseIn(ORM):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    body_part: Annotated[str, Field(max_length=60)] = ""
    muscle_group: Annotated[str, Field(max_length=60)] = ""
    sets: Annotated[int, Field(ge=0, le=1000)] | None = None
    reps: Annotated[int, Field(ge=0, le=10000)] | None = None
    weight_kg: Annotated[float, Field(ge=0, le=2000)] | None = None
    duration_min: Annotated[float, Field(ge=0, le=1440)] | None = None
    progress_metric: Literal["weight_kg", "reps", "duration_min"] | None = None


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    body_part: str
    muscle_group: str
    sets: int | None
    reps: int | None
    weight_kg: float | None
    duration_min: float | None
    progress_metric: str | None


class WorkoutIn(ORM):
    kind: Literal["gym", "cardio", "home"]
    performed_at: datetime
    duration_min: Annotated[float, Field(ge=0, le=1440)] = 0
    activity_type: Annotated[str, Field(max_length=80)] = ""
    distance_km: Annotated[float, Field(ge=0, le=10000)] | None = None
    calories_burned: Annotated[float, Field(ge=0, le=100000)] | None = None
    notes: Text = ""
    exercises: Annotated[list[ExerciseIn], Field(max_length=100)] = []


class WorkoutOut(OutBase):
    kind: str
    performed_at: datetime
    duration_min: float
    activity_type: str
    distance_km: float | None
    calories_burned: float | None
    notes: str
    exercises: list[ExerciseOut]


class StepIn(ORM):
    log_date: date
    steps: Annotated[int, Field(ge=0, le=500_000)]
    notes: Text = ""


class StepOut(OutBase):
    log_date: date
    steps: int
    notes: str


class SleepIn(ORM):
    bedtime: datetime
    wake_time: datetime
    duration_min: Annotated[float, Field(ge=0, le=1440)] | None = None
    quality: Annotated[int, Field(ge=1, le=5)] | None = None
    notes: Text = ""


class SleepOut(OutBase):
    bedtime: datetime
    wake_time: datetime
    duration_min: float
    quality: int | None
    notes: str


class WeightIn(ORM):
    log_date: date
    weight_kg: Annotated[float, Field(gt=20, lt=500)]
    body_fat_percent: Annotated[float, Field(ge=1, le=75)] | None = None
    notes: Text = ""


class WeightOut(OutBase):
    log_date: date
    weight_kg: float
    body_fat_percent: float | None
    notes: str


# ---------------- Nutrition ----------------
class FoodIn(ORM):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    serving_size: Annotated[str, Field(max_length=60)] = "1 serving"
    calories: NonNeg = 0
    protein_g: NonNeg = 0
    carbs_g: NonNeg = 0
    fat_g: NonNeg = 0
    fibre_g: NonNeg = 0
    favorite: bool = False


class FoodOut(OutBase):
    name: str
    serving_size: str
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fibre_g: float
    favorite: bool
    use_count: int


class MealItemIn(ORM):
    food_item_id: int | None = None
    name: Annotated[str, Field(min_length=1, max_length=120)]
    quantity: Annotated[float, Field(gt=0, le=10000)] = 1
    serving_size: Annotated[str, Field(max_length=60)] = "1 serving"
    calories: NonNeg = 0
    protein_g: NonNeg = 0
    carbs_g: NonNeg = 0
    fat_g: NonNeg = 0
    fibre_g: NonNeg = 0


class MealItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    food_item_id: int | None
    name: str
    quantity: float
    serving_size: str
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fibre_g: float


class MealIn(ORM):
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    eaten_at: datetime
    name: Annotated[str, Field(max_length=120)] = ""
    is_template: bool = False
    notes: Text = ""
    items: Annotated[list[MealItemIn], Field(max_length=100)] = []


class MealOut(OutBase):
    meal_type: str
    eaten_at: datetime
    name: str
    is_template: bool
    notes: str
    items: list[MealItemOut]

    @computed_field  # type: ignore[misc]
    @property
    def totals(self) -> dict:
        t = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0, "fibre_g": 0.0}
        for i in self.items:
            for k in t:
                t[k] += getattr(i, k) * i.quantity
        return {k: round(v, 1) for k, v in t.items()}


class WaterIn(ORM):
    logged_at: datetime
    amount_ml: Annotated[float, Field(gt=0, le=10000)]


class WaterOut(OutBase):
    logged_at: datetime
    amount_ml: float


# ---------------- Lifestyle ----------------
class BookIn(ORM):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    author: Annotated[str, Field(max_length=200)] = ""
    total_pages: Annotated[int, Field(gt=0, le=100000)] | None = None
    status: Literal["wishlist", "reading", "completed"] = "reading"
    completed_on: date | None = None
    notes: Text = ""


class BookOut(OutBase):
    title: str
    author: str
    total_pages: int | None
    status: str
    completed_on: date | None
    notes: str
    pages_read: int = 0
    reading_minutes: float = 0
    progress_pct: float | None = None


class ReadingIn(ORM):
    read_at: datetime
    book_id: int | None = None
    pages: Annotated[int, Field(ge=0, le=10000)] = 0
    duration_min: Annotated[float, Field(ge=0, le=1440)] = 0
    notes: Text = ""


class ReadingOut(OutBase):
    read_at: datetime
    book_id: int | None
    pages: int
    duration_min: float
    notes: str


class ScreenIn(ORM):
    log_date: date
    duration_min: Annotated[float, Field(gt=0, le=1440)]
    app_category: Annotated[str, Field(max_length=80)] = ""
    classification: Literal["productive", "entertainment"] = "entertainment"
    notes: Text = ""


class ScreenOut(OutBase):
    log_date: date
    duration_min: float
    app_category: str
    classification: str
    notes: str


class HabitIn(ORM):
    log_date: date
    name: Annotated[str, Field(min_length=1, max_length=120)]
    completed: bool = True
    value: float | None = None
    notes: Text = ""


class HabitOut(OutBase):
    log_date: date
    name: str
    completed: bool
    value: float | None
    notes: str


# ---------------- Productivity ----------------
class MilestoneIn(ORM):
    title: Annotated[str, Field(min_length=1, max_length=160)]
    due_date: date | None = None
    completed: bool = False


class MilestoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    due_date: date | None
    completed: bool


class GoalIn(ORM):
    name: Annotated[str, Field(min_length=1, max_length=160)]
    description: Text = ""
    start_date: date | None = None
    target_date: date | None = None
    progress: Annotated[float, Field(ge=0, le=100)] = 0
    status: Literal["active", "completed", "paused", "cancelled"] = "active"
    milestones: Annotated[list[MilestoneIn], Field(max_length=100)] = []


class GoalOut(OutBase):
    name: str
    description: str
    start_date: date | None
    target_date: date | None
    progress: float
    status: str
    milestones: list[MilestoneOut]

    @computed_field  # type: ignore[misc]
    @property
    def effective_progress(self) -> float:
        if self.milestones:
            return round(100 * sum(1 for m in self.milestones if m.completed) / len(self.milestones), 1)
        return self.progress


class TaskIn(ORM):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    description: Text = ""
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    due_date: date | None = None
    estimated_min: Annotated[float, Field(ge=0, le=100000)] | None = None
    actual_min: Annotated[float, Field(ge=0, le=100000)] | None = None
    status: Literal["pending", "in_progress", "completed", "cancelled"] = "pending"
    notes: Text = ""
    goal_id: int | None = None


class TaskOut(OutBase):
    name: str
    description: str
    priority: str
    due_date: date | None
    estimated_min: float | None
    actual_min: float | None
    status: str
    notes: str
    completed_at: datetime | None
    goal_id: int | None


# ---------------- Learning ----------------
class SkillIn(ORM):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    level: Literal["beginner", "intermediate", "advanced", "expert"] = "beginner"
    notes: Text = ""


class SkillOut(OutBase):
    name: str
    level: str
    notes: str


class CourseIn(ORM):
    name: Annotated[str, Field(min_length=1, max_length=160)]
    kind: Literal["course", "certification"] = "course"
    provider: Annotated[str, Field(max_length=120)] = ""
    status: Literal["planned", "in_progress", "completed", "dropped"] = "in_progress"
    progress: Annotated[float, Field(ge=0, le=100)] = 0
    start_date: date | None = None
    completed_on: date | None = None
    notes: Text = ""


class CourseOut(OutBase):
    name: str
    kind: str
    provider: str
    status: str
    progress: float
    start_date: date | None
    completed_on: date | None
    notes: str


class StudyIn(ORM):
    studied_at: datetime
    subject: Annotated[str, Field(min_length=1, max_length=160)]
    duration_min: Annotated[float, Field(ge=0, le=1440)] = 0
    topic: Annotated[str, Field(max_length=200)] = ""
    material: Annotated[str, Field(max_length=200)] = ""
    practical_exercises: Text = ""
    progress: Annotated[float, Field(ge=0, le=100)] | None = None
    skill_id: int | None = None
    course_id: int | None = None
    notes: Text = ""


class StudyOut(OutBase):
    studied_at: datetime
    subject: str
    duration_min: float
    topic: str
    material: str
    practical_exercises: str
    progress: float | None
    skill_id: int | None
    course_id: int | None
    notes: str


# ---------------- Social ----------------
class SocialIn(ORM):
    kind: Literal["friends", "outing", "event", "note"]
    activity: Annotated[str, Field(min_length=1, max_length=200)]
    occurred_at: datetime
    duration_min: Annotated[float, Field(ge=0, le=10080)] = 0
    participants: Short = ""
    location: Annotated[str, Field(max_length=200)] = ""
    description: Text = ""
    personal_notes: Text = ""


class SocialOut(OutBase):
    kind: str
    activity: str
    occurred_at: datetime
    duration_min: float
    participants: str
    location: str
    description: str
    personal_notes: str


# ---------------- Challenges ----------------
class ChallengeIn(ORM):
    name: Annotated[str, Field(min_length=1, max_length=160)]
    description: Text = ""
    metric: Annotated[str, Field(max_length=40)]
    comparator: Literal["gte", "lte"] | None = None
    target: Annotated[float, Field(ge=0, le=10_000_000)] = 1
    frequency: Literal["daily", "weekly", "monthly"] = "daily"
    start_date: date
    end_date: date | None = None


class ChallengeOut(OutBase):
    name: str
    description: str
    metric: str
    comparator: str
    target: float
    frequency: str
    start_date: date
    end_date: date | None
    status: str
    paused_on: date | None
    progress: dict = {}
    badges: list = []
    metric_label: str = ""
    unit: str = ""


class ManualCompleteIn(ORM):
    on_date: date | None = Field(default=None, alias="date")
    done: bool = True
