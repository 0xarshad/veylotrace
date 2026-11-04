from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, OwnedMixin

# NOTE: DateTime / Date columns here hold the user's local wall-clock values (no timezone conversion),
# so "today" and day boundaries always match what the user sees.


def money():
    return mapped_column(Numeric(12, 2), nullable=False)


# ---------------- Finance ----------------
class ExpenseCategory(OwnedMixin, Base):
    __tablename__ = "expense_categories"
    name: Mapped[str] = mapped_column(String(80))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("expense_categories.id", ondelete="CASCADE"), nullable=True)


class Expense(OwnedMixin, Base):
    __tablename__ = "expenses"
    occurred_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    amount: Mapped[Decimal] = money()
    category_id: Mapped[int | None] = mapped_column(ForeignKey("expense_categories.id", ondelete="SET NULL"), nullable=True)
    subcategory_id: Mapped[int | None] = mapped_column(ForeignKey("expense_categories.id", ondelete="SET NULL"), nullable=True)
    description: Mapped[str] = mapped_column(String(255), default="")
    payment_method: Mapped[str] = mapped_column(String(24), default="other")
    necessity: Mapped[str] = mapped_column(String(16), default="essential")
    notes: Mapped[str] = mapped_column(Text, default="")


class Income(OwnedMixin, Base):
    __tablename__ = "income"
    occurred_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    amount: Mapped[Decimal] = money()
    source_type: Mapped[str] = mapped_column(String(24), default="salary")
    description: Mapped[str] = mapped_column(String(255), default="")
    notes: Mapped[str] = mapped_column(Text, default="")


class Transfer(OwnedMixin, Base):
    """Movement between the user's own accounts. Never counted as expense or income."""

    __tablename__ = "transfers"
    occurred_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    amount: Mapped[Decimal] = money()
    from_account: Mapped[str] = mapped_column(String(80))
    to_account: Mapped[str] = mapped_column(String(80))
    notes: Mapped[str] = mapped_column(Text, default="")


class Budget(OwnedMixin, Base):
    __tablename__ = "budgets"
    period: Mapped[str] = mapped_column(String(12))  # daily|weekly|monthly|custom
    amount: Mapped[Decimal] = money()
    category_id: Mapped[int | None] = mapped_column(ForeignKey("expense_categories.id", ondelete="CASCADE"), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    name: Mapped[str] = mapped_column(String(100), default="")


class SavingsGoal(OwnedMixin, Base):
    __tablename__ = "savings_goals"
    name: Mapped[str] = mapped_column(String(120))
    target_amount: Mapped[Decimal] = money()
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    planned_monthly_contribution: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    notes: Mapped[str] = mapped_column(Text, default="")


class SavingsContribution(OwnedMixin, Base):
    __tablename__ = "savings_contributions"
    occurred_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    amount: Mapped[Decimal] = money()
    goal_id: Mapped[int | None] = mapped_column(ForeignKey("savings_goals.id", ondelete="SET NULL"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")


# ---------------- Health ----------------
class WorkoutSession(OwnedMixin, Base):
    __tablename__ = "workout_sessions"
    kind: Mapped[str] = mapped_column(String(12))  # gym|cardio|home
    performed_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    duration_min: Mapped[float] = mapped_column(Float, default=0)
    activity_type: Mapped[str] = mapped_column(String(80), default="")
    distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    calories_burned: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    exercises: Mapped[list["ExerciseEntry"]] = relationship(
        back_populates="workout", cascade="all, delete-orphan", order_by="ExerciseEntry.id", lazy="selectin"
    )


class ExerciseEntry(Base):
    __tablename__ = "exercise_entries"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    workout_id: Mapped[int] = mapped_column(ForeignKey("workout_sessions.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    muscle_group: Mapped[str] = mapped_column(String(60), default="")
    sets: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    workout: Mapped[WorkoutSession] = relationship(back_populates="exercises")


class StepLog(OwnedMixin, Base):
    __tablename__ = "step_logs"
    log_date: Mapped[date] = mapped_column(Date, index=True)
    steps: Mapped[int] = mapped_column(Integer)
    notes: Mapped[str] = mapped_column(Text, default="")


class SleepLog(OwnedMixin, Base):
    __tablename__ = "sleep_logs"
    bedtime: Mapped[datetime] = mapped_column(DateTime)
    wake_time: Mapped[datetime] = mapped_column(DateTime, index=True)
    duration_min: Mapped[float] = mapped_column(Float, default=0)
    quality: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")


class WeightLog(OwnedMixin, Base):
    __tablename__ = "weight_logs"
    log_date: Mapped[date] = mapped_column(Date, index=True)
    weight_kg: Mapped[float] = mapped_column(Float)
    body_fat_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")


# ---------------- Nutrition ----------------
class FoodItem(OwnedMixin, Base):
    __tablename__ = "food_items"
    name: Mapped[str] = mapped_column(String(120))
    serving_size: Mapped[str] = mapped_column(String(60), default="1 serving")
    calories: Mapped[float] = mapped_column(Float, default=0)
    protein_g: Mapped[float] = mapped_column(Float, default=0)
    carbs_g: Mapped[float] = mapped_column(Float, default=0)
    fat_g: Mapped[float] = mapped_column(Float, default=0)
    fibre_g: Mapped[float] = mapped_column(Float, default=0)
    favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    use_count: Mapped[int] = mapped_column(Integer, default=0)


class Meal(OwnedMixin, Base):
    __tablename__ = "meals"
    meal_type: Mapped[str] = mapped_column(String(12))  # breakfast|lunch|dinner|snack
    eaten_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    is_template: Mapped[bool] = mapped_column(Boolean, default=False)  # saved meal
    notes: Mapped[str] = mapped_column(Text, default="")
    items: Mapped[list["MealItem"]] = relationship(
        back_populates="meal", cascade="all, delete-orphan", order_by="MealItem.id", lazy="selectin"
    )


class MealItem(Base):
    __tablename__ = "meal_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    meal_id: Mapped[int] = mapped_column(ForeignKey("meals.id", ondelete="CASCADE"), index=True)
    food_item_id: Mapped[int | None] = mapped_column(ForeignKey("food_items.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    quantity: Mapped[float] = mapped_column(Float, default=1)
    serving_size: Mapped[str] = mapped_column(String(60), default="1 serving")
    # nutrition values are PER SERVING; totals = quantity * value
    calories: Mapped[float] = mapped_column(Float, default=0)
    protein_g: Mapped[float] = mapped_column(Float, default=0)
    carbs_g: Mapped[float] = mapped_column(Float, default=0)
    fat_g: Mapped[float] = mapped_column(Float, default=0)
    fibre_g: Mapped[float] = mapped_column(Float, default=0)
    meal: Mapped[Meal] = relationship(back_populates="items")


class WaterIntake(OwnedMixin, Base):
    __tablename__ = "water_intakes"
    logged_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    amount_ml: Mapped[float] = mapped_column(Float)


# ---------------- Lifestyle ----------------
class Book(OwnedMixin, Base):
    __tablename__ = "books"
    title: Mapped[str] = mapped_column(String(200))
    author: Mapped[str] = mapped_column(String(200), default="")
    total_pages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="reading")  # wishlist|reading|completed
    completed_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")


class ReadingSession(OwnedMixin, Base):
    __tablename__ = "reading_sessions"
    read_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    book_id: Mapped[int | None] = mapped_column(ForeignKey("books.id", ondelete="SET NULL"), nullable=True)
    pages: Mapped[int] = mapped_column(Integer, default=0)
    duration_min: Mapped[float] = mapped_column(Float, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")


class ScreenTimeLog(OwnedMixin, Base):
    __tablename__ = "screen_time_logs"
    log_date: Mapped[date] = mapped_column(Date, index=True)
    duration_min: Mapped[float] = mapped_column(Float)
    app_category: Mapped[str] = mapped_column(String(80), default="")
    classification: Mapped[str] = mapped_column(String(16), default="entertainment")  # productive|entertainment
    notes: Mapped[str] = mapped_column(Text, default="")


class HabitLog(OwnedMixin, Base):
    __tablename__ = "habit_logs"
    log_date: Mapped[date] = mapped_column(Date, index=True)
    name: Mapped[str] = mapped_column(String(120))
    completed: Mapped[bool] = mapped_column(Boolean, default=True)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")


# ---------------- Productivity ----------------
class Goal(OwnedMixin, Base):
    __tablename__ = "goals"
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    progress: Mapped[float] = mapped_column(Float, default=0)  # manual 0-100, used when no milestones
    status: Mapped[str] = mapped_column(String(12), default="active")
    milestones: Mapped[list["Milestone"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan", order_by="Milestone.id", lazy="selectin"
    )


class Milestone(Base):
    __tablename__ = "milestones"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    goal: Mapped[Goal] = relationship(back_populates="milestones")


class Task(OwnedMixin, Base):
    __tablename__ = "tasks"
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[str] = mapped_column(String(10), default="medium")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    estimated_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    actual_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="pending")
    notes: Mapped[str] = mapped_column(Text, default="")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    goal_id: Mapped[int | None] = mapped_column(ForeignKey("goals.id", ondelete="SET NULL"), nullable=True)


# ---------------- Learning ----------------
class Skill(OwnedMixin, Base):
    __tablename__ = "skills"
    name: Mapped[str] = mapped_column(String(120))
    level: Mapped[str] = mapped_column(String(24), default="beginner")
    notes: Mapped[str] = mapped_column(Text, default="")


class Course(OwnedMixin, Base):
    __tablename__ = "courses"
    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(16), default="course")  # course|certification
    provider: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(12), default="in_progress")
    progress: Mapped[float] = mapped_column(Float, default=0)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")


class StudySession(OwnedMixin, Base):
    __tablename__ = "study_sessions"
    studied_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    subject: Mapped[str] = mapped_column(String(160))
    duration_min: Mapped[float] = mapped_column(Float, default=0)
    topic: Mapped[str] = mapped_column(String(200), default="")
    material: Mapped[str] = mapped_column(String(200), default="")
    practical_exercises: Mapped[str] = mapped_column(Text, default="")
    progress: Mapped[float | None] = mapped_column(Float, nullable=True)
    skill_id: Mapped[int | None] = mapped_column(ForeignKey("skills.id", ondelete="SET NULL"), nullable=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")


# ---------------- Social ----------------
class SocialActivity(OwnedMixin, Base):
    __tablename__ = "social_activities"
    kind: Mapped[str] = mapped_column(String(16))  # friends|outing|event|note
    activity: Mapped[str] = mapped_column(String(200))
    occurred_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    duration_min: Mapped[float] = mapped_column(Float, default=0)
    participants: Mapped[str] = mapped_column(String(255), default="")
    location: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    personal_notes: Mapped[str] = mapped_column(Text, default="")


# ---------------- Challenges ----------------
class Challenge(OwnedMixin, Base):
    __tablename__ = "challenges"
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    metric: Mapped[str] = mapped_column(String(40))  # key in services.challenges.METRICS or "manual"
    comparator: Mapped[str] = mapped_column(String(4), default="gte")  # gte|lte
    target: Mapped[float] = mapped_column(Float, default=1)
    frequency: Mapped[str] = mapped_column(String(10), default="daily")  # daily|weekly|monthly
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="active")  # active|paused|ended
    paused_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    pauses: Mapped[list] = mapped_column(JSON, default=list)  # closed pause ranges: [["2026-01-01", "2026-01-05"], ...]


class ChallengeProgress(Base):
    """Only manual completions are stored; automatic progress is always derived from live records."""

    __tablename__ = "challenge_progress"
    __table_args__ = (UniqueConstraint("challenge_id", "period_start", name="uq_challenge_period"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    challenge_id: Mapped[int] = mapped_column(ForeignKey("challenges.id", ondelete="CASCADE"), index=True)
    period_start: Mapped[date] = mapped_column(Date)
    value: Mapped[float] = mapped_column(Float, default=0)
    completed: Mapped[bool] = mapped_column(Boolean, default=True)


class ChallengeBadge(Base):
    __tablename__ = "challenge_badges"
    __table_args__ = (UniqueConstraint("challenge_id", "code", name="uq_challenge_badge"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    challenge_id: Mapped[int] = mapped_column(ForeignKey("challenges.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(32))
    awarded_on: Mapped[date] = mapped_column(Date)
