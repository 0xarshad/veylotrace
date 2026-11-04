"""Daily Tracker: one chronological timeline for a date, assembled from every module (no duplicate storage)."""

from datetime import date, datetime, time

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import (
    Expense,
    Income,
    Meal,
    ReadingSession,
    SavingsContribution,
    SleepLog,
    SocialActivity,
    StepLog,
    StudySession,
    Task,
    WaterIntake,
    WeightLog,
    WorkoutSession,
    ScreenTimeLog,
    HabitLog,
)
from app.services.analytics import _in_range, _live, daily_overview, get_targets


def timeline(db: Session, uid: int, day: date) -> dict:
    items: list[dict] = []

    def add(kind: str, obj, at: datetime | None, title: str, detail: str, link: str, status: str = "done") -> None:
        items.append({"type": kind, "id": obj.id, "time": at.isoformat() if at else None, "title": title, "detail": detail, "status": status, "link": link})

    for e in db.scalars(select(Expense).where(*_live(Expense, uid), *_in_range(Expense.occurred_at, day, day))):
        add("expense", e, e.occurred_at, e.description or "Expense", f"{float(e.amount):.2f} · {e.payment_method}", "/expenses")
    for i in db.scalars(select(Income).where(*_live(Income, uid), *_in_range(Income.occurred_at, day, day))):
        add("income", i, i.occurred_at, i.description or "Income", f"+{float(i.amount):.2f} · {i.source_type}", "/expenses")
    for c in db.scalars(select(SavingsContribution).where(*_live(SavingsContribution, uid), *_in_range(SavingsContribution.occurred_at, day, day))):
        add("savings", c, c.occurred_at, "Savings contribution", f"{float(c.amount):.2f}", "/expenses")
    for m in db.scalars(select(Meal).where(*_live(Meal, uid), Meal.is_template.is_(False), *_in_range(Meal.eaten_at, day, day))):
        cal = sum(it.calories * it.quantity for it in m.items)
        add("meal", m, m.eaten_at, m.name or m.meal_type.title(), f"{m.meal_type} · {cal:.0f} kcal", "/nutrition")
    for w in db.scalars(select(WaterIntake).where(*_live(WaterIntake, uid), *_in_range(WaterIntake.logged_at, day, day))):
        add("water", w, w.logged_at, "Water", f"{w.amount_ml:.0f} ml", "/nutrition")
    for w in db.scalars(select(WorkoutSession).where(*_live(WorkoutSession, uid), *_in_range(WorkoutSession.performed_at, day, day))):
        add("workout", w, w.performed_at, w.activity_type or f"{w.kind.title()} workout", f"{w.duration_min:.0f} min", "/health")
    for s in db.scalars(select(SleepLog).where(*_live(SleepLog, uid), *_in_range(SleepLog.wake_time, day, day))):
        add("sleep", s, s.wake_time, "Sleep", f"{s.duration_min / 60:.1f} h", "/health")
    for s in db.scalars(select(StepLog).where(*_live(StepLog, uid), StepLog.log_date == day)):
        add("steps", s, datetime.combine(day, time(23, 59)), "Steps", f"{s.steps:,}", "/health")
    for w in db.scalars(select(WeightLog).where(*_live(WeightLog, uid), WeightLog.log_date == day)):
        detail = f"{w.weight_kg:.1f} kg" + (f" · {w.body_fat_percent:.1f}% body fat" if w.body_fat_percent is not None else "")
        add("weight", w, datetime.combine(day, time(23, 55)), "Weight", detail, "/health?tab=weight")
    for s in db.scalars(select(StudySession).where(*_live(StudySession, uid), *_in_range(StudySession.studied_at, day, day))):
        add("study", s, s.studied_at, s.subject, f"{s.duration_min:.0f} min", "/learning")
    for r in db.scalars(select(ReadingSession).where(*_live(ReadingSession, uid), *_in_range(ReadingSession.read_at, day, day))):
        add("reading", r, r.read_at, "Reading", f"{r.pages} pages · {r.duration_min:.0f} min", "/lifestyle")
    for s in db.scalars(select(ScreenTimeLog).where(*_live(ScreenTimeLog, uid), ScreenTimeLog.log_date == day)):
        add("screen", s, datetime.combine(day, time(23, 58)), s.app_category or "Screen time", f"{s.duration_min:.0f} min · {s.classification}", "/lifestyle")
    for h in db.scalars(select(HabitLog).where(*_live(HabitLog, uid), HabitLog.log_date == day)):
        add("habit", h, datetime.combine(day, time(23, 57)), h.name, "completed" if h.completed else "missed", "/lifestyle", "done" if h.completed else "pending")
    for s in db.scalars(select(SocialActivity).where(*_live(SocialActivity, uid), *_in_range(SocialActivity.occurred_at, day, day))):
        add("social", s, s.occurred_at, s.activity, f"{s.kind} · {s.duration_min:.0f} min", "/social")
    a, b = datetime.combine(day, time.min), datetime.combine(day, time.max)
    tasks = db.scalars(
        select(Task).where(*_live(Task, uid), or_(Task.due_date == day, (Task.completed_at >= a) & (Task.completed_at <= b)), Task.status != "cancelled")
    )
    for t in tasks:
        add("task", t, t.completed_at or datetime.combine(day, time(23, 56)), t.name, f"{t.priority} priority", "/productivity", "done" if t.status == "completed" else "pending")
    items.sort(key=lambda x: (x["time"] or "", x["type"]))

    ov = daily_overview(db, uid, day)
    targets = get_targets(db, uid)
    counts = {i["type"] for i in items}
    missing = [
        {"key": k, "label": label, "link": link}
        for k, label, link, ok in [
            ("meals", "No meals logged", "/nutrition", "meal" in counts),
            ("water", "Water not logged", "/nutrition", ov["water_ml"] > 0),
            ("steps", "Steps not logged", "/health", "steps" in counts),
            ("sleep", "Sleep not logged", "/health", "sleep" in counts),
            ("expenses", "No expenses logged", "/expenses", "expense" in counts),
        ]
        if not ok
    ]
    return {
        "date": day.isoformat(),
        "items": items,
        "overview": ov,
        "incomplete": missing,
        "completed": sum(1 for i in items if i["type"] == "task" and i["status"] == "done"),
        "pending": sum(1 for i in items if i["status"] == "pending"),
        "targets": targets,
    }
