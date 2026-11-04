"""Tracking module definitions: each module is a Spec for the generic CRUD router plus validation hooks."""

import math
from datetime import date, datetime, timedelta

from fastapi import APIRouter
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError, conflict
from app.models import (
    Book,
    Budget,
    Course,
    Expense,
    ExpenseCategory,
    ExerciseEntry,
    FoodItem,
    Goal,
    HabitLog,
    Income,
    Meal,
    MealItem,
    Milestone,
    ReadingSession,
    SavingsContribution,
    SavingsGoal,
    ScreenTimeLog,
    Skill,
    SleepLog,
    SocialActivity,
    StepLog,
    StudySession,
    Task,
    Transfer,
    WaterIntake,
    WeightLog,
    WorkoutSession,
)
from app.schemas import tracking as S
from app.services.crud import Spec, build_router, merged


def _validation(field: str, message: str) -> AppError:
    return AppError(422, "validation_error", message, [{"field": field, "message": message}])


# ---------------- Finance ----------------
def prepare_category(db: Session, uid: int, values: dict, obj) -> None:
    name = merged(obj, values, "name").strip()
    parent_id = merged(obj, values, "parent_id")
    values["name"] = name
    if parent_id is not None:
        parent = db.scalar(select(ExpenseCategory).where(ExpenseCategory.id == parent_id, ExpenseCategory.user_id == uid, ExpenseCategory.deleted_at.is_(None)))
        if parent is None:
            raise _validation("parent_id", "Parent category not found.")
        if parent.parent_id is not None:
            raise _validation("parent_id", "Only one level of subcategories is supported.")
        if obj is not None and parent.id == obj.id:
            raise _validation("parent_id", "A category cannot be its own parent.")
    stmt = select(ExpenseCategory.id).where(
        ExpenseCategory.user_id == uid, func.lower(ExpenseCategory.name) == name.lower(), ExpenseCategory.deleted_at.is_(None),
        ExpenseCategory.parent_id.is_(None) if parent_id is None else ExpenseCategory.parent_id == parent_id,
    )
    if obj is not None:
        stmt = stmt.where(ExpenseCategory.id != obj.id)
    if db.scalar(stmt):
        raise conflict("A category with this name already exists.", "duplicate_category")


def prepare_expense(db: Session, uid: int, values: dict, obj) -> None:
    cat = merged(obj, values, "category_id")
    sub = merged(obj, values, "subcategory_id")
    if cat is not None and sub is None:
        picked = db.get(ExpenseCategory, cat)
        if picked is not None and picked.parent_id is not None:  # a subcategory was chosen as "category"
            values["category_id"], values["subcategory_id"] = picked.parent_id, picked.id
            return
    if sub is not None:
        sub_row = db.get(ExpenseCategory, sub)
        if sub_row.parent_id is None:
            raise _validation("subcategory_id", "Selected subcategory is not a subcategory.")
        if cat is None:
            values["category_id"] = sub_row.parent_id
        elif sub_row.parent_id != cat:
            raise _validation("subcategory_id", "Subcategory does not belong to the selected category.")


def prepare_budget(db: Session, uid: int, values: dict, obj) -> None:
    period = merged(obj, values, "period")
    start, end = merged(obj, values, "start_date"), merged(obj, values, "end_date")
    if period == "custom":
        if not start or not end:
            raise _validation("start_date", "Custom budgets need a start and end date.")
        if end < start:
            raise _validation("end_date", "End date must not be before the start date.")
    else:
        values["start_date"] = values["end_date"] = None


def enrich_savings_goals(db: Session, uid: int, rows: list[dict]) -> None:
    ids = [r["id"] for r in rows]
    sums = dict(
        db.execute(
            select(SavingsContribution.goal_id, func.sum(SavingsContribution.amount))
            .where(SavingsContribution.user_id == uid, SavingsContribution.deleted_at.is_(None), SavingsContribution.goal_id.in_(ids))
            .group_by(SavingsContribution.goal_id)
        ).all()
    )
    for r in rows:
        contributed = round(float(sums.get(r["id"]) or 0), 2)
        target = r["target_amount"]
        remaining = round(max(target - contributed, 0), 2)
        r.update(contributed=contributed, remaining=remaining, progress_pct=round(min(100, 100 * contributed / target), 1) if target else 0)
        planned = r["planned_monthly_contribution"]
        if remaining == 0:
            r["projected_completion"] = date.today().isoformat()
        elif planned > 0:
            r["projected_completion"] = (date.today() + timedelta(days=30 * math.ceil(remaining / planned))).isoformat()
        else:
            r["projected_completion"] = None


# ---------------- Health ----------------
def prepare_sleep(db: Session, uid: int, values: dict, obj) -> None:
    bed, wake = merged(obj, values, "bedtime"), merged(obj, values, "wake_time")
    if wake <= bed:
        raise _validation("wake_time", "Wake-up time must be after bedtime.")
    minutes = (wake - bed).total_seconds() / 60
    if minutes > 24 * 60:
        raise _validation("wake_time", "Sleep cannot exceed 24 hours.")
    if values.get("duration_min") is None:
        values["duration_min"] = round(minutes, 1)


def prepare_steps(db: Session, uid: int, values: dict, obj) -> None:
    d = merged(obj, values, "log_date")
    stmt = select(StepLog.id).where(StepLog.user_id == uid, StepLog.log_date == d, StepLog.deleted_at.is_(None))
    if obj is not None:
        stmt = stmt.where(StepLog.id != obj.id)
    if db.scalar(stmt):
        raise conflict("Steps for this date already exist; edit the existing entry.", "duplicate_date")


# ---------------- Nutrition ----------------
def recount_foods(db: Session, uid: int, _obj=None) -> None:
    db.flush()
    counts = dict(
        db.execute(
            select(MealItem.food_item_id, func.count())
            .join(Meal, Meal.id == MealItem.meal_id)
            .where(MealItem.user_id == uid, MealItem.food_item_id.is_not(None), Meal.deleted_at.is_(None), Meal.is_template.is_(False))
            .group_by(MealItem.food_item_id)
        ).all()
    )
    for food in db.scalars(select(FoodItem).where(FoodItem.user_id == uid)):
        food.use_count = counts.get(food.id, 0)


# ---------------- Lifestyle ----------------
def enrich_books(db: Session, uid: int, rows: list[dict]) -> None:
    ids = [r["id"] for r in rows]
    agg = {
        bid: (pages or 0, mins or 0)
        for bid, pages, mins in db.execute(
            select(ReadingSession.book_id, func.sum(ReadingSession.pages), func.sum(ReadingSession.duration_min))
            .where(ReadingSession.user_id == uid, ReadingSession.deleted_at.is_(None), ReadingSession.book_id.in_(ids))
            .group_by(ReadingSession.book_id)
        ).all()
    }
    for r in rows:
        pages, mins = agg.get(r["id"], (0, 0))
        r["pages_read"], r["reading_minutes"] = int(pages), float(mins)
        total = r["total_pages"]
        r["progress_pct"] = round(min(100, 100 * pages / total), 1) if total else None
        if r["status"] == "completed":
            r["progress_pct"] = 100.0


def prepare_book(db: Session, uid: int, values: dict, obj) -> None:
    status = merged(obj, values, "status")
    if status == "completed" and not merged(obj, values, "completed_on"):
        values["completed_on"] = date.today()
    if status != "completed" and "status" in values:
        values["completed_on"] = None


# ---------------- Productivity ----------------
def prepare_task(db: Session, uid: int, values: dict, obj) -> None:
    status = merged(obj, values, "status")
    if status == "completed":
        if getattr(obj, "completed_at", None) is None:
            values["completed_at"] = datetime.now().replace(microsecond=0)
    else:
        values["completed_at"] = None


# ---------------- Learning ----------------
def prepare_course(db: Session, uid: int, values: dict, obj) -> None:
    if merged(obj, values, "status") == "completed":
        values.setdefault("progress", 100.0)
        if not merged(obj, values, "completed_on"):
            values["completed_on"] = date.today()
        values["progress"] = 100.0


SPECS: list[Spec] = [
    Spec("expense-categories", "finance", ExpenseCategory, S.CategoryIn, S.CategoryOut, search=("name",), filters=("parent_id",), sorts=("name",), default_sort="name",
         refs={"parent_id": ExpenseCategory}, prepare=prepare_category, duplicable=False),
    Spec("expenses", "finance", Expense, S.ExpenseIn, S.ExpenseOut, date_field="occurred_at", search=("description", "notes"),
         filters=("category_id", "subcategory_id", "payment_method", "necessity"), sorts=("amount",),
         refs={"category_id": ExpenseCategory, "subcategory_id": ExpenseCategory}, prepare=prepare_expense, audit=True),
    Spec("income", "finance", Income, S.IncomeIn, S.IncomeOut, date_field="occurred_at", search=("description", "notes"), filters=("source_type",), sorts=("amount",), audit=True),
    Spec("transfers", "finance", Transfer, S.TransferIn, S.TransferOut, date_field="occurred_at", search=("from_account", "to_account", "notes"), sorts=("amount",)),
    Spec("budgets", "finance", Budget, S.BudgetIn, S.BudgetOut, search=("name",), filters=("period", "category_id"), refs={"category_id": ExpenseCategory}, prepare=prepare_budget, default_sort="-id"),
    Spec("savings-goals", "finance", SavingsGoal, S.SavingsGoalIn, S.SavingsGoalOut, search=("name", "notes"), sorts=("name", "target_date"), default_sort="-id", enrich=enrich_savings_goals),
    Spec("savings-contributions", "finance", SavingsContribution, S.ContributionIn, S.ContributionOut, date_field="occurred_at", search=("notes",), filters=("goal_id",),
         sorts=("amount",), refs={"goal_id": SavingsGoal}, audit=True),
    Spec("workouts", "health", WorkoutSession, S.WorkoutIn, S.WorkoutOut, date_field="performed_at", search=("activity_type", "notes"), filters=("kind",), sorts=("duration_min",),
         children={"exercises": (ExerciseEntry, {})}),
    Spec("steps", "health", StepLog, S.StepIn, S.StepOut, date_field="log_date", search=("notes",), sorts=("steps",), prepare=prepare_steps, duplicable=False),
    Spec("sleep", "health", SleepLog, S.SleepIn, S.SleepOut, date_field="wake_time", search=("notes",), sorts=("duration_min",), prepare=prepare_sleep),
    Spec("weight", "health", WeightLog, S.WeightIn, S.WeightOut, date_field="log_date", search=("notes",), sorts=("weight_kg",), duplicable=False),
    Spec("foods", "nutrition", FoodItem, S.FoodIn, S.FoodOut, search=("name",), filters=("favorite",), sorts=("name", "use_count", "calories"), default_sort="name"),
    Spec("meals", "nutrition", Meal, S.MealIn, S.MealOut, date_field="eaten_at", search=("name", "notes"), filters=("meal_type", "is_template"),
         refs={}, children={"items": (MealItem, {"food_item_id": FoodItem})}, after_save=recount_foods),
    Spec("water", "nutrition", WaterIntake, S.WaterIn, S.WaterOut, date_field="logged_at", sorts=("amount_ml",)),
    Spec("books", "lifestyle", Book, S.BookIn, S.BookOut, search=("title", "author", "notes"), filters=("status",), sorts=("title",), default_sort="-id",
         prepare=prepare_book, enrich=enrich_books, duplicable=False),
    Spec("reading", "lifestyle", ReadingSession, S.ReadingIn, S.ReadingOut, date_field="read_at", search=("notes",), filters=("book_id",), refs={"book_id": Book}, sorts=("pages", "duration_min")),
    Spec("screen-time", "lifestyle", ScreenTimeLog, S.ScreenIn, S.ScreenOut, date_field="log_date", search=("app_category", "notes"), filters=("classification",), sorts=("duration_min",)),
    Spec("habits", "lifestyle", HabitLog, S.HabitIn, S.HabitOut, date_field="log_date", search=("name", "notes"), filters=("completed", "name")),
    Spec("tasks", "productivity", Task, S.TaskIn, S.TaskOut, date_field="due_date", search=("name", "description", "notes"), filters=("status", "priority", "goal_id"),
         sorts=("priority", "name", "completed_at"), refs={"goal_id": Goal}, prepare=prepare_task, default_sort="-id"),
    Spec("goals", "productivity", Goal, S.GoalIn, S.GoalOut, date_field="target_date", search=("name", "description"), filters=("status",), children={"milestones": (Milestone, {})},
         default_sort="-id", duplicable=False),
    Spec("skills", "learning", Skill, S.SkillIn, S.SkillOut, search=("name", "notes"), filters=("level",), sorts=("name",), default_sort="name", duplicable=False),
    Spec("courses", "learning", Course, S.CourseIn, S.CourseOut, search=("name", "provider", "notes"), filters=("kind", "status"), sorts=("name", "progress"), prepare=prepare_course, default_sort="-id"),
    Spec("study", "learning", StudySession, S.StudyIn, S.StudyOut, date_field="studied_at", search=("subject", "topic", "material", "notes"), filters=("skill_id", "course_id"),
         refs={"skill_id": Skill, "course_id": Course}, sorts=("duration_min", "subject")),
    Spec("social", "social", SocialActivity, S.SocialIn, S.SocialOut, date_field="occurred_at", search=("activity", "participants", "location", "description", "personal_notes"),
         filters=("kind",), sorts=("duration_min",)),
]


def tracking_router() -> APIRouter:
    router = APIRouter()
    for spec in SPECS:
        router.include_router(build_router(spec))
    return router
