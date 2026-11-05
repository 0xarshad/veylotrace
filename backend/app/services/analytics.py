"""Deterministic analytics engine. Every number shown in the dashboard, reports, challenges and AI facts
is computed here from stored records (soft-deleted rows are always excluded; transfers never count as spend)."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Book,
    Budget,
    Course,
    Expense,
    ExpenseCategory,
    Goal,
    HabitLog,
    Income,
    Meal,
    ReadingSession,
    SavingsContribution,
    SavingsGoal,
    ScreenTimeLog,
    SleepLog,
    SocialActivity,
    StepLog,
    StudySession,
    Task,
    UserSettings,
    WaterIntake,
    WeightLog,
    WorkoutSession,
)
from app.services.defaults import DEFAULT_TARGETS


def r2(v) -> float:
    return round(float(v or 0), 2)


def r1(v) -> float:
    return round(float(v or 0), 1)


def dt_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    return datetime.combine(start, time.min), datetime.combine(end + timedelta(days=1), time.min)


def days_in(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def week_start(d: date, monday: bool = True) -> date:
    return d - timedelta(days=d.weekday() if monday else (d.weekday() + 1) % 7)


def month_range(d: date) -> tuple[date, date]:
    first = d.replace(day=1)
    nxt = (first + timedelta(days=32)).replace(day=1)
    return first, nxt - timedelta(days=1)


def period_range(period: str, anchor: date, monday: bool = True) -> tuple[date, date]:
    if period == "daily":
        return anchor, anchor
    if period == "weekly":
        ws = week_start(anchor, monday)
        return ws, ws + timedelta(days=6)
    return month_range(anchor)


def previous_range(start: date, end: date, kind: str) -> tuple[date, date]:
    if kind == "monthly":
        pe = start - timedelta(days=1)
        return pe.replace(day=1), pe
    length = (end - start).days + 1
    return start - timedelta(days=length), start - timedelta(days=1)


def get_targets(db: Session, uid: int) -> dict:
    s = db.scalar(select(UserSettings).where(UserSettings.user_id == uid))
    return {**DEFAULT_TARGETS, **(s.targets if s and s.targets else {})}


def week_starts_monday(db: Session, uid: int) -> bool:
    s = db.scalar(select(UserSettings).where(UserSettings.user_id == uid))
    return True if s is None else bool(s.week_starts_monday)


def body_part_for_muscle(muscle_group: str) -> str:
    value = muscle_group.strip().casefold()
    if value in {"chest", "upper chest", "lower chest"} or "pectoral" in value:
        return "Chest"
    if value in {"lats", "upper back & traps", "lower back", "back"} or "trap" in value:
        return "Back"
    if "shoulder" in value or "delt" in value:
        return "Shoulders"
    if "bicep" in value or "brachialis" in value:
        return "Biceps"
    if "tricep" in value:
        return "Triceps"
    if "forearm" in value:
        return "Forearms"
    if value == "arms":
        return "Arms"
    if any(word in value for word in ("quadr", "hamstring", "glute", "adductor", "abductor", "calf", "leg")):
        return "Legs"
    if "neck" in value:
        return "Neck"
    if "core" in value or "ab" in value or "oblique" in value:
        return "Core"
    if "full body" in value:
        return "Full body"
    return "Other"


def _live(model, uid: int):
    return [model.user_id == uid, model.deleted_at.is_(None)]


def _in_range(col, start: date, end: date):
    a, b = dt_bounds(start, end)
    return [col >= a, col < b]


def _date_range(col, start: date, end: date):
    return [col >= start, col <= end]


# ---------------------------------------------------------------- finance
def category_names(db: Session, uid: int) -> dict[int, str]:
    return {c.id: c.name for c in db.scalars(select(ExpenseCategory).where(ExpenseCategory.user_id == uid))}


def expenses_in(db: Session, uid: int, start: date, end: date) -> list[Expense]:
    return list(db.scalars(select(Expense).where(*_live(Expense, uid), *_in_range(Expense.occurred_at, start, end)).order_by(Expense.occurred_at)))


def finance_summary(db: Session, uid: int, start: date, end: date) -> dict:
    names = category_names(db, uid)
    exps = expenses_in(db, uid, start, end)
    total = sum((e.amount for e in exps), Decimal(0))
    by_cat: dict[str, Decimal] = defaultdict(Decimal)
    by_pay: dict[str, Decimal] = defaultdict(Decimal)
    by_nec: dict[str, Decimal] = defaultdict(Decimal)
    by_day: dict[date, Decimal] = defaultdict(Decimal)
    for e in exps:
        by_cat[names.get(e.category_id, "Uncategorized")] += e.amount
        by_pay[e.payment_method] += e.amount
        by_nec[e.necessity] += e.amount
        by_day[e.occurred_at.date()] += e.amount
    incomes = list(db.scalars(select(Income).where(*_live(Income, uid), *_in_range(Income.occurred_at, start, end))))
    income = sum((i.amount for i in incomes), Decimal(0))
    income_by_day: dict[date, Decimal] = defaultdict(Decimal)
    for row in incomes:
        income_by_day[row.occurred_at.date()] += row.amount
    savings = sum((c.amount for c in db.scalars(select(SavingsContribution).where(*_live(SavingsContribution, uid), *_in_range(SavingsContribution.occurred_at, start, end)))), Decimal(0))
    return {
        "expenses_total": r2(total),
        "expense_count": len(exps),
        "income_total": r2(income),
        "savings_contributed": r2(savings),
        "net_cash_flow": r2(income - total - savings),  # surplus after spending AND actual savings transfers
        "by_category": sorted(({"name": k, "amount": r2(v)} for k, v in by_cat.items()), key=lambda x: -x["amount"]),
        "by_payment_method": sorted(({"name": k, "amount": r2(v)} for k, v in by_pay.items()), key=lambda x: -x["amount"]),
        "essential": r2(by_nec.get("essential")),
        "non_essential": r2(by_nec.get("non_essential")),
        "daily": [{"date": d.isoformat(), "amount": r2(by_day.get(d))} for d in days_in(start, end)] if (end - start).days <= 400 else [],
        "income_daily": [{"date": d.isoformat(), "amount": r2(income_by_day.get(d))} for d in days_in(start, end)] if (end - start).days <= 400 else [],
    }


def budget_status(db: Session, uid: int, on: date) -> list[dict]:
    names = category_names(db, uid)
    monday = week_starts_monday(db, uid)
    out = []
    for b in db.scalars(select(Budget).where(*_live(Budget, uid)).order_by(Budget.id)):
        if b.period == "custom":
            if not (b.start_date and b.end_date and b.start_date <= on <= b.end_date):
                continue
            s, e = b.start_date, b.end_date
        else:
            s, e = period_range(b.period, on, monday)
        spent = sum((x.amount for x in expenses_in(db, uid, s, e) if b.category_id is None or x.category_id == b.category_id), Decimal(0))
        amount = float(b.amount)
        pct = round(100 * float(spent) / amount, 1) if amount else 0
        out.append(
            {
                "id": b.id, "name": b.name, "period": b.period, "category_id": b.category_id,
                "category": names.get(b.category_id) if b.category_id else "Overall",
                "amount": r2(b.amount), "spent": r2(spent), "remaining": r2(Decimal(b.amount) - spent),
                "pct": pct, "start": s.isoformat(), "end": e.isoformat(),
                "status": "over" if pct > 100 else "warning" if pct >= 90 else "ok",
            }
        )
    return out


def savings_overview(db: Session, uid: int) -> dict:
    total = sum((c.amount for c in db.scalars(select(SavingsContribution).where(*_live(SavingsContribution, uid)))), Decimal(0))
    goals = []
    sums: dict[int | None, Decimal] = defaultdict(Decimal)
    for c in db.scalars(select(SavingsContribution).where(*_live(SavingsContribution, uid))):
        sums[c.goal_id] += c.amount
    for g in db.scalars(select(SavingsGoal).where(*_live(SavingsGoal, uid))):
        got = sums.get(g.id, Decimal(0))
        goals.append({"id": g.id, "name": g.name, "target": r2(g.target_amount), "contributed": r2(got), "remaining": r2(max(Decimal(g.target_amount) - got, 0)),
                      "progress_pct": round(min(100, 100 * float(got) / float(g.target_amount)), 1) if g.target_amount else 0})
    return {"total_contributed": r2(total), "goals": goals}


# ---------------------------------------------------------------- nutrition
def nutrition_daily(db: Session, uid: int, start: date, end: date) -> dict[date, dict]:
    days = {d: {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0, "fibre_g": 0.0, "water_ml": 0.0, "meals": 0} for d in days_in(start, end)}
    meals = db.scalars(select(Meal).where(*_live(Meal, uid), Meal.is_template.is_(False), *_in_range(Meal.eaten_at, start, end)))
    for m in meals:
        row = days[m.eaten_at.date()]
        row["meals"] += 1
        for it in m.items:
            for k in ("calories", "protein_g", "carbs_g", "fat_g", "fibre_g"):
                row[k] += getattr(it, k) * it.quantity
    for w in db.scalars(select(WaterIntake).where(*_live(WaterIntake, uid), *_in_range(WaterIntake.logged_at, start, end))):
        days[w.logged_at.date()]["water_ml"] += w.amount_ml
    return days


def nutrition_summary(db: Session, uid: int, start: date, end: date) -> dict:
    daily = nutrition_daily(db, uid, start, end)
    targets = get_targets(db, uid)
    profile = db.scalar(select(UserSettings).where(UserSettings.user_id == uid))
    logged = [d for d, v in daily.items() if v["meals"] or v["water_ml"]]
    n = max(len(logged), 1)
    tot = {k: sum(v[k] for v in daily.values()) for k in ("calories", "protein_g", "carbs_g", "fat_g", "fibre_g", "water_ml")}
    return {
        "totals": {k: r1(v) for k, v in tot.items()},
        "daily_average": {k: r1(v / n) for k, v in tot.items()},  # averaged over days with logged data only
        "days_logged": len(logged),
        "targets": {k: targets[k] for k in ("calories", "protein_g", "carbs_g", "fat_g", "fibre_g", "water_ml")},
        "target_weight_kg": profile.target_weight_kg if profile else None,
        "daily": [{"date": d.isoformat(), **{k: r1(v) if isinstance(v, float) else v for k, v in row.items()}} for d, row in daily.items()] if (end - start).days <= 400 else [],
        "target_days_met": {
            "calories": sum(1 for d in logged if daily[d]["calories"] <= targets["calories"] and daily[d]["meals"]),
            "protein": sum(1 for d in logged if daily[d]["protein_g"] >= targets["protein_g"]),
            "water": sum(1 for d in logged if daily[d]["water_ml"] >= targets["water_ml"]),
        },
    }


# ---------------------------------------------------------------- health
def health_summary(db: Session, uid: int, start: date, end: date) -> dict:
    targets = get_targets(db, uid)
    profile = db.scalar(select(UserSettings).where(UserSettings.user_id == uid))
    monday = week_starts_monday(db, uid)
    workouts = list(db.scalars(select(WorkoutSession).where(*_live(WorkoutSession, uid), *_in_range(WorkoutSession.performed_at, start, end)).order_by(WorkoutSession.performed_at)))
    weeks: dict[date, int] = defaultdict(int)
    by_kind: dict[str, int] = defaultdict(int)
    daily_min: dict[date, float] = defaultdict(float)
    progression: dict[str, list] = defaultdict(list)
    timed_exercises = {"plank", "side plank", "rkc plank", "hollow-body hold", "l-sit hold", "back extension hold", "dead hang"}
    rep_exercises = {"pull-up", "chin-up", "assisted pull-up", "push-up", "chest dip", "triceps dip", "diamond push-up"}
    for w in workouts:
        weeks[week_start(w.performed_at.date(), monday)] += 1
        by_kind[w.kind] += 1
        daily_min[w.performed_at.date()] += w.duration_min
    # Keep the progression picker useful even when the selected summary range is short.
    all_gym_workouts = db.scalars(select(WorkoutSession).where(*_live(WorkoutSession, uid), WorkoutSession.kind == "gym").order_by(WorkoutSession.performed_at)).all()
    for w in all_gym_workouts:
        for ex in w.exercises:
            name_key = ex.name.strip().casefold()
            metric = ex.progress_metric or ("duration_min" if name_key in timed_exercises else "reps" if name_key in rep_exercises else "duration_min" if ex.duration_min is not None and ex.weight_kg is None else "reps" if ex.reps is not None and ex.weight_kg is None else "weight_kg")
            value = {
                "weight_kg": ex.weight_kg,
                "reps": ex.reps if ex.reps is not None else ex.weight_kg if name_key in rep_exercises else None,
                "duration_min": ex.duration_min if ex.duration_min is not None else ex.weight_kg if name_key in timed_exercises else None,
            }[metric]
            progression[ex.name].append({
                "date": w.performed_at.date().isoformat(),
                "body_part": ex.body_part or body_part_for_muscle(ex.muscle_group),
                "muscle_group": ex.muscle_group,
                "metric_type": metric,
                "metric_value": value,
                "metric_unit": {"weight_kg": "kg", "reps": "reps", "duration_min": "min"}[metric],
                "weight_kg": ex.weight_kg,
                "volume": ex.sets * ex.reps * ex.weight_kg if ex.weight_kg is not None and ex.sets and ex.reps else None,
                "sets": ex.sets,
                "reps": ex.reps,
                "duration_min": ex.duration_min,
            })
    progression = defaultdict(list, {name: rows[-100:] for name, rows in progression.items()})

    this_week_start = week_start(date.today(), monday)
    this_week_workouts = db.scalars(select(WorkoutSession).where(
        *_live(WorkoutSession, uid),
        WorkoutSession.kind.in_(("gym", "home")),
        WorkoutSession.performed_at >= datetime.combine(this_week_start, time.min),
        WorkoutSession.performed_at < datetime.combine(date.today() + timedelta(days=1), time.min),
    ).order_by(WorkoutSession.performed_at)).all()
    trained_groups: dict[str, dict] = {}
    for workout in this_week_workouts:
        for exercise_entry in workout.exercises:
            group = exercise_entry.muscle_group.strip()
            if not group:
                continue
            body_part = exercise_entry.body_part or body_part_for_muscle(group)
            item = trained_groups.setdefault(group, {"body_part": body_part, "muscle_group": group, "sessions": set(), "exercise_count": 0, "last_trained": "", "exercises": {}})
            item["sessions"].add(workout.id)
            item["exercise_count"] += 1
            item["last_trained"] = workout.performed_at.date().isoformat()
            exercise = item["exercises"].setdefault(exercise_entry.name, {"name": exercise_entry.name, "logs": []})
            name_key = exercise_entry.name.strip().casefold()
            metric = exercise_entry.progress_metric or ("duration_min" if name_key in timed_exercises else "reps" if name_key in rep_exercises else "duration_min" if exercise_entry.duration_min is not None and exercise_entry.weight_kg is None else "reps" if exercise_entry.reps is not None and exercise_entry.weight_kg is None else "weight_kg")
            value = {
                "weight_kg": exercise_entry.weight_kg,
                "reps": exercise_entry.reps if exercise_entry.reps is not None else exercise_entry.weight_kg if name_key in rep_exercises else None,
                "duration_min": exercise_entry.duration_min if exercise_entry.duration_min is not None else exercise_entry.weight_kg if name_key in timed_exercises else None,
            }[metric]
            reps = value if metric == "reps" else exercise_entry.reps
            duration = value if metric == "duration_min" else exercise_entry.duration_min
            exercise["logs"].append({
                "date": workout.performed_at.date().isoformat(),
                "body_part": body_part,
                "metric_type": metric,
                "metric_value": value,
                "metric_unit": {"weight_kg": "kg", "reps": "reps", "duration_min": "min"}[metric],
                "sets": exercise_entry.sets,
                "reps": reps,
                "weight_kg": exercise_entry.weight_kg if metric == "weight_kg" else None,
                "duration_min": duration,
            })
    steps = {s.log_date: s.steps for s in db.scalars(select(StepLog).where(*_live(StepLog, uid), *_date_range(StepLog.log_date, start, end)))}
    sleeps = list(db.scalars(select(SleepLog).where(*_live(SleepLog, uid), *_in_range(SleepLog.wake_time, start, end)).order_by(SleepLog.wake_time)))
    weight_logs = list(db.scalars(select(WeightLog).where(*_live(WeightLog, uid)).order_by(WeightLog.log_date, WeightLog.id)))
    range_weights = [w for w in weight_logs if start <= w.log_date <= end]
    latest_weight = weight_logs[-1] if weight_logs else None
    nweeks = max(((end - start).days + 1) / 7, 1 / 7)
    return {
        "workout_count": len(workouts),
        "workout_minutes": r1(sum(w.duration_min for w in workouts)),
        "workout_days": len({w.performed_at.date() for w in workouts}),
        "workouts_per_week": round(len(workouts) / nweeks, 1),
        "workouts_per_week_target": targets["workouts_per_week"],
        "by_kind": dict(by_kind),
        "calories_burned": r1(sum(w.calories_burned or 0 for w in workouts)),
        "distance_km": r1(sum(w.distance_km or 0 for w in workouts)),
        "weekly_frequency": [{"week": k.isoformat(), "workouts": v} for k, v in sorted(weeks.items())],
        "muscle_groups_week_start": this_week_start.isoformat(),
        "muscle_groups_this_week": [
            {
                **item,
                "sessions": len(item["sessions"]),
                "exercises": [
                    {**exercise, "logs": sorted(exercise["logs"], key=lambda log: log["date"], reverse=True)}
                    for exercise in sorted(item["exercises"].values(), key=lambda entry: entry["name"].casefold())
                ],
            }
            for item in sorted(trained_groups.values(), key=lambda v: (-len(v["sessions"]), v["muscle_group"].casefold()))
        ],
        "workout_minutes_daily": [{"date": d.isoformat(), "minutes": r1(daily_min.get(d))} for d in days_in(start, end)] if (end - start).days <= 400 else [],
        "exercise_progression": {k: v for k, v in sorted(progression.items(), key=lambda kv: (-len(kv[1]), kv[0].casefold()))},
        "steps_total": sum(steps.values()),
        "steps_average": round(sum(steps.values()) / len(steps)) if steps else 0,
        "steps_days": len(steps),
        "steps_target": targets["steps"],
        "steps_daily": [{"date": d.isoformat(), "steps": steps.get(d, 0)} for d in days_in(start, end)] if (end - start).days <= 400 else [],
        "sleep_nights": len(sleeps),
        "sleep_avg_hours": r1(sum(s.duration_min for s in sleeps) / len(sleeps) / 60) if sleeps else 0,
        "sleep_avg_quality": r1(sum(s.quality for s in sleeps if s.quality) / max(1, sum(1 for s in sleeps if s.quality))) if any(s.quality for s in sleeps) else None,
        "sleep_target_hours": targets["sleep_hours"],
        "sleep_daily": [{"date": s.wake_time.date().isoformat(), "hours": r1(s.duration_min / 60), "quality": s.quality} for s in sleeps],
        "weight_daily": [{"date": w.log_date.isoformat(), "weight_kg": r1(w.weight_kg), "body_fat_percent": r1(w.body_fat_percent) if w.body_fat_percent is not None else None} for w in range_weights],
        "weight_log_count": len(weight_logs),
        "current_weight_kg": r1(latest_weight.weight_kg) if latest_weight else None,
        "current_body_fat_percent": r1(latest_weight.body_fat_percent) if latest_weight and latest_weight.body_fat_percent is not None else None,
        "height_cm": profile.height_cm if profile else None,
        "starting_weight_kg": profile.starting_weight_kg if profile else None,
        "profile_body_fat_percent": profile.body_fat_percent if profile else None,
        "target_weight_kg": profile.target_weight_kg if profile else None,
    }


# ---------------------------------------------------------------- productivity / learning / lifestyle
def productivity_summary(db: Session, uid: int, start: date, end: date) -> dict:
    a, b = dt_bounds(start, end)
    completed = list(db.scalars(select(Task).where(*_live(Task, uid), Task.status == "completed", Task.completed_at >= a, Task.completed_at < b)))
    open_tasks = list(db.scalars(select(Task).where(*_live(Task, uid), Task.status.in_(("pending", "in_progress")))))
    today = date.today()
    goals = list(db.scalars(select(Goal).where(*_live(Goal, uid), Goal.status == "active")))

    def gp(g: Goal) -> float:
        return round(100 * sum(1 for m in g.milestones if m.completed) / len(g.milestones), 1) if g.milestones else g.progress

    per_day: dict[date, int] = defaultdict(int)
    for t in completed:
        per_day[t.completed_at.date()] += 1
    return {
        "tasks_completed": len(completed),
        "tasks_pending": len(open_tasks),
        "tasks_overdue": sum(1 for t in open_tasks if t.due_date and t.due_date < today),
        "tasks_due_in_range": sum(1 for t in open_tasks if t.due_date and start <= t.due_date <= end),
        "high_priority_completed": sum(1 for t in completed if t.priority in ("high", "urgent")),
        "estimated_vs_actual_min": {"estimated": r1(sum(t.estimated_min or 0 for t in completed)), "actual": r1(sum(t.actual_min or 0 for t in completed))},
        "completed_daily": [{"date": d.isoformat(), "completed": per_day.get(d, 0)} for d in days_in(start, end)] if (end - start).days <= 400 else [],
        "goals": [{"id": g.id, "name": g.name, "progress": gp(g), "target_date": g.target_date.isoformat() if g.target_date else None} for g in goals],
    }


def learning_summary(db: Session, uid: int, start: date, end: date) -> dict:
    sessions = list(db.scalars(select(StudySession).where(*_live(StudySession, uid), *_in_range(StudySession.studied_at, start, end))))
    by_subject: dict[str, float] = defaultdict(float)
    per_day: dict[date, float] = defaultdict(float)
    sessions_per_day: dict[date, int] = defaultdict(int)
    for s in sessions:
        by_subject[s.subject] += s.duration_min
        per_day[s.studied_at.date()] += s.duration_min
        sessions_per_day[s.studied_at.date()] += 1
    courses = list(db.scalars(select(Course).where(*_live(Course, uid), Course.status == "in_progress")))
    return {
        "study_minutes": r1(sum(s.duration_min for s in sessions)),
        "study_sessions": len(sessions),
        "by_subject": sorted(({"name": k, "minutes": r1(v)} for k, v in by_subject.items()), key=lambda x: -x["minutes"]),
        "study_daily": [{"date": d.isoformat(), "minutes": r1(per_day.get(d))} for d in days_in(start, end)] if (end - start).days <= 400 else [],
        "sessions_daily": [{"date": d.isoformat(), "sessions": sessions_per_day.get(d, 0)} for d in days_in(start, end)] if (end - start).days <= 400 else [],
        "courses_in_progress": [{"id": c.id, "name": c.name, "progress": c.progress} for c in courses],
    }


def lifestyle_summary(db: Session, uid: int, start: date, end: date) -> dict:
    reads = list(db.scalars(select(ReadingSession).where(*_live(ReadingSession, uid), *_in_range(ReadingSession.read_at, start, end))))
    screens = list(db.scalars(select(ScreenTimeLog).where(*_live(ScreenTimeLog, uid), *_date_range(ScreenTimeLog.log_date, start, end))))
    social = list(db.scalars(select(SocialActivity).where(*_live(SocialActivity, uid), *_in_range(SocialActivity.occurred_at, start, end))))
    habits = list(db.scalars(select(HabitLog).where(*_live(HabitLog, uid), *_date_range(HabitLog.log_date, start, end))))
    books = list(db.scalars(select(Book).where(*_live(Book, uid), Book.status == "reading")))
    done_books = list(db.scalars(select(Book).where(*_live(Book, uid), Book.status == "completed", *_date_range(Book.completed_on, start, end))))
    screen_daily: dict[date, float] = defaultdict(float)
    social_daily: dict[date, int] = defaultdict(int)
    habits_daily: dict[date, dict[str, int]] = defaultdict(lambda: {"completed": 0, "entries": 0})
    for s in screens:
        screen_daily[s.log_date] += s.duration_min
    read_daily: dict[date, float] = defaultdict(float)
    for r in reads:
        read_daily[r.read_at.date()] += r.duration_min
    for activity in social:
        social_daily[activity.occurred_at.date()] += 1
    for habit in habits:
        habits_daily[habit.log_date]["entries"] += 1
        habits_daily[habit.log_date]["completed"] += int(habit.completed)
    prod = sum(s.duration_min for s in screens if s.classification == "productive")
    ent = sum(s.duration_min for s in screens if s.classification == "entertainment")
    return {
        "reading_minutes": r1(sum(r.duration_min for r in reads)),
        "pages_read": sum(r.pages for r in reads),
        "books_in_progress": len(books),
        "books_completed": len(done_books),
        "reading_daily": [{"date": d.isoformat(), "minutes": r1(read_daily.get(d))} for d in days_in(start, end)] if (end - start).days <= 400 else [],
        "screen_minutes": r1(prod + ent),
        "screen_productive_minutes": r1(prod),
        "screen_entertainment_minutes": r1(ent),
        "screen_daily": [{"date": d.isoformat(), "minutes": r1(screen_daily.get(d))} for d in days_in(start, end)] if (end - start).days <= 400 else [],
        "social_count": len(social),
        "social_minutes": r1(sum(s.duration_min for s in social)),
        "social_by_kind": {k: sum(1 for s in social if s.kind == k) for k in {s.kind for s in social}},
        "social_daily": [{"date": d.isoformat(), "count": social_daily.get(d, 0)} for d in days_in(start, end)] if (end - start).days <= 400 else [],
        "habit_entries": len(habits),
        "habits_completed": sum(1 for h in habits if h.completed),
        "habits_daily": [{"date": d.isoformat(), **habits_daily[d]} for d in days_in(start, end)] if (end - start).days <= 400 else [],
    }


# ---------------------------------------------------------------- composite views
def daily_overview(db: Session, uid: int, day: date) -> dict:
    fin = finance_summary(db, uid, day, day)
    nut = nutrition_summary(db, uid, day, day)
    health = health_summary(db, uid, day, day)
    prod = productivity_summary(db, uid, day, day)
    learn = learning_summary(db, uid, day, day)
    life = lifestyle_summary(db, uid, day, day)
    budgets = [b for b in budget_status(db, uid, day) if b["period"] == "daily" and b["category_id"] is None]
    return {
        "date": day.isoformat(),
        "expenses": fin["expenses_total"],
        "income": fin["income_total"],
        "daily_budget": budgets[0]["amount"] if budgets else None,
        "budget_remaining": budgets[0]["remaining"] if budgets else None,
        "savings_contributed": fin["savings_contributed"],
        "workout_minutes": health["workout_minutes"],
        "steps": health["steps_total"],
        "sleep_hours": health["sleep_avg_hours"],
        "calories": nut["totals"]["calories"],
        "protein_g": nut["totals"]["protein_g"],
        "water_ml": nut["totals"]["water_ml"],
        "tasks_completed": prod["tasks_completed"],
        "study_minutes": learn["study_minutes"],
        "reading_minutes": life["reading_minutes"],
        "targets": nut["targets"] | {
            "steps": health["steps_target"], "sleep_hours": health["sleep_target_hours"],
            "study_min": get_targets(db, uid)["study_min"], "reading_min": get_targets(db, uid)["reading_min"],
        },
    }


def has_any_data(db: Session, uid: int, start: date, end: date) -> bool:
    checks = [
        (Expense, Expense.occurred_at, True), (Income, Income.occurred_at, True), (Meal, Meal.eaten_at, True), (WorkoutSession, WorkoutSession.performed_at, True),
        (StudySession, StudySession.studied_at, True), (ReadingSession, ReadingSession.read_at, True), (WaterIntake, WaterIntake.logged_at, True),
        (StepLog, StepLog.log_date, False), (ScreenTimeLog, ScreenTimeLog.log_date, False), (SleepLog, SleepLog.wake_time, True), (SocialActivity, SocialActivity.occurred_at, True),
        (SavingsContribution, SavingsContribution.occurred_at, True),
    ]
    for model, col, is_dt in checks:
        conds = _in_range(col, start, end) if is_dt else _date_range(col, start, end)
        if db.scalar(select(model.id).where(*_live(model, uid), *conds).limit(1)) is not None:
            return True
    return db.scalar(select(Task.id).where(*_live(Task, uid)).limit(1)) is not None


def dashboard(db: Session, uid: int, start: date, end: date, day: date) -> dict:
    fin = finance_summary(db, uid, start, end)
    budgets = budget_status(db, uid, end)
    overall = [b for b in budgets if b["category_id"] is None and b["period"] == "monthly"]
    return {
        "range": {"start": start.isoformat(), "end": end.isoformat()},
        "has_data": has_any_data(db, uid, start, end),
        "daily_overview": daily_overview(db, uid, day),
        "financial": {**fin, "budget_consumption": overall[0] if overall else None, "budgets": budgets, "savings": savings_overview(db, uid)},
        "health": health_summary(db, uid, start, end),
        "nutrition": nutrition_summary(db, uid, start, end),
        "productivity": productivity_summary(db, uid, start, end),
        "learning": learning_summary(db, uid, start, end),
        "lifestyle": lifestyle_summary(db, uid, start, end),
    }


@dataclass
class Range:
    start: date
    end: date
    kind: str


def resolve_range(kind: str, anchor: date, start: date | None, end: date | None, monday: bool = True) -> Range:
    if kind == "custom":
        if not start or not end or end < start or (end - start).days > 3660:
            raise ValueError("A valid custom range (start <= end, max 10 years) is required.")
        return Range(start, end, "custom")
    s, e = period_range({"day": "daily", "week": "weekly", "month": "monthly"}.get(kind, kind), anchor, monday)
    return Range(s, e, kind)


def _delta(cur: float, prev: float) -> dict:
    return {"current": r2(cur), "previous": r2(prev), "change": r2(cur - prev), "change_pct": round(100 * (cur - prev) / prev, 1) if prev else None}


def report(db: Session, uid: int, kind: str, anchor: date) -> dict:
    """kind: daily | weekly | monthly. Includes comparison with the immediately preceding period."""
    monday = week_starts_monday(db, uid)
    s, e = period_range(kind, anchor, monday)
    ps, pe = previous_range(s, e, kind)
    cur_fin, prev_fin = finance_summary(db, uid, s, e), finance_summary(db, uid, ps, pe)
    cur_h, prev_h = health_summary(db, uid, s, e), health_summary(db, uid, ps, pe)
    cur_n, prev_n = nutrition_summary(db, uid, s, e), nutrition_summary(db, uid, ps, pe)
    cur_p, prev_p = productivity_summary(db, uid, s, e), productivity_summary(db, uid, ps, pe)
    cur_l, prev_l = learning_summary(db, uid, s, e), learning_summary(db, uid, ps, pe)
    cur_life, prev_life = lifestyle_summary(db, uid, s, e), lifestyle_summary(db, uid, ps, pe)
    return {
        "kind": kind,
        "range": {"start": s.isoformat(), "end": e.isoformat()},
        "previous_range": {"start": ps.isoformat(), "end": pe.isoformat()},
        "finance": cur_fin,
        "budgets": budget_status(db, uid, e),
        "savings": savings_overview(db, uid),
        "health": cur_h,
        "nutrition": cur_n,
        "productivity": cur_p,
        "learning": cur_l,
        "lifestyle": cur_life,
        "comparison": {
            "expenses": _delta(cur_fin["expenses_total"], prev_fin["expenses_total"]),
            "income": _delta(cur_fin["income_total"], prev_fin["income_total"]),
            "savings_contributed": _delta(cur_fin["savings_contributed"], prev_fin["savings_contributed"]),
            "workout_minutes": _delta(cur_h["workout_minutes"], prev_h["workout_minutes"]),
            "workout_count": _delta(cur_h["workout_count"], prev_h["workout_count"]),
            "calories_avg": _delta(cur_n["daily_average"]["calories"], prev_n["daily_average"]["calories"]),
            "protein_avg": _delta(cur_n["daily_average"]["protein_g"], prev_n["daily_average"]["protein_g"]),
            "tasks_completed": _delta(cur_p["tasks_completed"], prev_p["tasks_completed"]),
            "study_minutes": _delta(cur_l["study_minutes"], prev_l["study_minutes"]),
            "reading_minutes": _delta(cur_life["reading_minutes"], prev_life["reading_minutes"]),
            "screen_minutes": _delta(cur_life["screen_minutes"], prev_life["screen_minutes"]),
        },
    }
