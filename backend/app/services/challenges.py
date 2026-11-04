"""Challenges & habit tracking. Progress for metric-based challenges is always *derived* from live records
(so one activity can never be counted twice and edits/deletes are reflected). Only manual challenges
store completions."""

from collections.abc import Callable
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, bad_request, conflict
from app.models import Challenge, ChallengeBadge, ChallengeProgress, SavingsContribution, SleepLog, StepLog, Task
from app.services import analytics as A


def _expenses(db, uid, s, e, necessity=None):
    return float(sum((x.amount for x in A.expenses_in(db, uid, s, e) if necessity is None or x.necessity == necessity), Decimal(0)))


def _tasks_done(db, uid, s, e, high=False):
    a, b = A.dt_bounds(s, e)
    stmt = select(Task).where(*A._live(Task, uid), Task.status == "completed", Task.completed_at >= a, Task.completed_at < b)
    return sum(1 for t in db.scalars(stmt) if not high or t.priority in ("high", "urgent"))


# metric key -> (label, unit, default comparator, default target, calculator)
METRICS: dict[str, tuple[str, str, str, float, Callable]] = {
    "non_essential_spending": ("Non-essential spending", "amount", "lte", 0, lambda db, u, s, e: _expenses(db, u, s, e, "non_essential")),
    "total_spending": ("Total spending", "amount", "lte", 0, lambda db, u, s, e: _expenses(db, u, s, e)),
    "savings_contributed": ("Savings contributed", "amount", "gte", 1, lambda db, u, s, e: float(sum((c.amount for c in db.scalars(select(SavingsContribution).where(*A._live(SavingsContribution, u), *A._in_range(SavingsContribution.occurred_at, s, e)))), Decimal(0)))),
    "workout_sessions": ("Workouts", "sessions", "gte", 1, lambda db, u, s, e: A.health_summary(db, u, s, e)["workout_count"]),
    "workout_minutes": ("Workout minutes", "min", "gte", 30, lambda db, u, s, e: A.health_summary(db, u, s, e)["workout_minutes"]),
    "steps": ("Steps", "steps", "gte", 8000, lambda db, u, s, e: sum(x.steps for x in db.scalars(select(StepLog).where(*A._live(StepLog, u), *A._date_range(StepLog.log_date, s, e))))),
    "sleep_hours": ("Sleep hours", "h", "gte", 7, lambda db, u, s, e: sum(x.duration_min for x in db.scalars(select(SleepLog).where(*A._live(SleepLog, u), *A._in_range(SleepLog.wake_time, s, e)))) / 60),
    "calories": ("Calories consumed", "kcal", "lte", 2000, lambda db, u, s, e: A.nutrition_summary(db, u, s, e)["totals"]["calories"]),
    "protein_g": ("Protein", "g", "gte", 100, lambda db, u, s, e: A.nutrition_summary(db, u, s, e)["totals"]["protein_g"]),
    "water_ml": ("Water", "ml", "gte", 2500, lambda db, u, s, e: A.nutrition_summary(db, u, s, e)["totals"]["water_ml"]),
    "reading_minutes": ("Reading minutes", "min", "gte", 20, lambda db, u, s, e: A.lifestyle_summary(db, u, s, e)["reading_minutes"]),
    "study_minutes": ("Study minutes", "min", "gte", 60, lambda db, u, s, e: A.learning_summary(db, u, s, e)["study_minutes"]),
    "screen_minutes": ("Screen time", "min", "lte", 120, lambda db, u, s, e: A.lifestyle_summary(db, u, s, e)["screen_minutes"]),
    "entertainment_screen_minutes": ("Entertainment screen time", "min", "lte", 60, lambda db, u, s, e: A.lifestyle_summary(db, u, s, e)["screen_entertainment_minutes"]),
    "tasks_completed": ("Tasks completed", "tasks", "gte", 1, lambda db, u, s, e: _tasks_done(db, u, s, e)),
    "priority_tasks_completed": ("High-priority tasks completed", "tasks", "gte", 1, lambda db, u, s, e: _tasks_done(db, u, s, e, high=True)),
    "manual": ("Manual check-off", "times", "gte", 1, lambda db, u, s, e: 0),
}

BADGES = {
    "first_win": "First success",
    "streak_3": "3-period streak",
    "streak_7": "7-period streak",
    "streak_14": "14-period streak",
    "streak_30": "30-period streak",
    "total_10": "10 successes",
    "total_50": "50 successes",
}


def periods(ch: Challenge, today: date) -> list[tuple[date, date]]:
    """Period (start, end) pairs from the challenge start until today (or its end date), excluding paused ranges."""
    last = min(ch.end_date, today) if ch.end_date else today
    out: list[tuple[date, date]] = []
    cur = ch.start_date
    pauses = [(date.fromisoformat(a), date.fromisoformat(b)) for a, b in (ch.pauses or [])]
    if ch.paused_on:
        pauses.append((ch.paused_on, today))
    if ch.frequency == "weekly":
        cur = A.week_start(cur)
    elif ch.frequency == "monthly":
        cur = cur.replace(day=1)
    while cur <= last:
        s, e = A.period_range({"daily": "daily", "weekly": "weekly", "monthly": "monthly"}[ch.frequency], cur)
        paused = any(ps <= s and e <= pe for ps, pe in pauses) if ch.frequency != "daily" else any(ps <= s <= pe for ps, pe in pauses)
        if not paused:
            out.append((s, e))
        cur = e + timedelta(days=1)
    return out


def evaluate(db: Session, ch: Challenge, today: date | None = None) -> dict:
    today = today or date.today()
    metric = METRICS[ch.metric]
    manual = {p.period_start: p for p in db.scalars(select(ChallengeProgress).where(ChallengeProgress.challenge_id == ch.id))}
    history = []
    for s, e in periods(ch, today):
        is_current = e >= today
        if ch.metric == "manual":
            done = s in manual and manual[s].completed
            value = 1.0 if done else 0.0
            met = done
        else:
            value = float(metric[4](db, ch.user_id, s, min(e, today)))
            met = value >= ch.target if ch.comparator == "gte" else (value <= ch.target and not is_current)
        status = "met" if met else "in_progress" if is_current else "missed"
        history.append({"period_start": s.isoformat(), "period_end": e.isoformat(), "value": round(value, 2), "status": status, "met": met})
    # streaks: an unfinished current period never breaks a streak
    cur_streak = longest = run = 0
    for h in history:
        if h["met"]:
            run += 1
            longest = max(longest, run)
        elif h["status"] == "missed":
            run = 0
    for h in reversed(history):
        if h["met"]:
            cur_streak += 1
        elif h["status"] == "in_progress":
            continue
        else:
            break
    total_met = sum(1 for h in history if h["met"])
    current = history[-1] if history else None
    return {
        "history": history,
        "current": current,
        "current_streak": cur_streak,
        "longest_streak": longest,
        "total_met": total_met,
        "periods_total": len(history),
        "success_rate": round(100 * total_met / len([h for h in history if h["status"] != "in_progress"] or [1]), 1) if history else 0,
    }


def award_badges(db: Session, ch: Challenge, ev: dict) -> list[str]:
    have = {b.code for b in db.scalars(select(ChallengeBadge).where(ChallengeBadge.challenge_id == ch.id))}
    wanted = []
    if ev["total_met"] >= 1:
        wanted.append("first_win")
    for n in (3, 7, 14, 30):
        if ev["longest_streak"] >= n:
            wanted.append(f"streak_{n}")
    for n in (10, 50):
        if ev["total_met"] >= n:
            wanted.append(f"total_{n}")
    new = [c for c in wanted if c not in have]
    for code in new:
        db.add(ChallengeBadge(user_id=ch.user_id, challenge_id=ch.id, code=code, awarded_on=date.today()))
    return new


def enrich_challenges(db: Session, uid: int, rows: list[dict]) -> None:
    for row in rows:
        ch = db.get(Challenge, row["id"])
        ev = evaluate(db, ch)
        award_badges(db, ch, ev)
        db.flush()
        badges = db.scalars(select(ChallengeBadge).where(ChallengeBadge.challenge_id == ch.id).order_by(ChallengeBadge.id))
        row["progress"] = {k: v for k, v in ev.items() if k != "history"}
        row["badges"] = [{"code": b.code, "label": BADGES.get(b.code, b.code), "awarded_on": b.awarded_on.isoformat()} for b in badges]
        row["metric_label"] = METRICS[ch.metric][0]
        row["unit"] = METRICS[ch.metric][1]
    db.commit()


def prepare_challenge(db: Session, uid: int, values: dict, obj) -> None:
    metric = values.get("metric", getattr(obj, "metric", None))
    if metric not in METRICS:
        raise AppError(422, "validation_error", "Unknown metric.", [{"field": "metric", "message": "Unknown metric."}])
    if metric == "manual":
        values["comparator"] = "gte"
        values.setdefault("target", 1)
    elif values.get("comparator") is None and obj is None:
        values["comparator"] = METRICS[metric][2]
    start = values.get("start_date", getattr(obj, "start_date", None))
    end = values.get("end_date", getattr(obj, "end_date", None))
    if start and end and end < start:
        raise AppError(422, "validation_error", "End date must not be before the start date.", [{"field": "end_date", "message": "Before start date."}])


def pause(db: Session, ch: Challenge) -> None:
    if ch.status != "active":
        raise conflict("Only active challenges can be paused.")
    ch.status = "paused"
    ch.paused_on = date.today()


def resume(db: Session, ch: Challenge) -> None:
    if ch.status != "paused" or not ch.paused_on:
        raise conflict("Challenge is not paused.")
    ch.pauses = [*(ch.pauses or []), [ch.paused_on.isoformat(), (date.today() - timedelta(days=1)).isoformat()]]
    ch.paused_on = None
    ch.status = "active"


def restart(db: Session, ch: Challenge) -> None:
    """Fresh start from today. Earned badges stay as history; manual completions are cleared."""
    for p in db.scalars(select(ChallengeProgress).where(ChallengeProgress.challenge_id == ch.id)):
        db.delete(p)
    ch.start_date = date.today()
    ch.end_date = None if (ch.end_date and ch.end_date < date.today()) else ch.end_date
    ch.pauses, ch.paused_on, ch.status = [], None, "active"


def set_manual(db: Session, ch: Challenge, on: date, done: bool) -> None:
    if ch.metric != "manual":
        raise bad_request("Progress for this challenge is calculated automatically from your records.", "auto_challenge")
    if ch.status != "active":
        raise conflict("Challenge is not active.")
    if on > date.today() or on < ch.start_date:
        raise bad_request("Date is outside the challenge window.")
    ps, _ = A.period_range(ch.frequency if ch.frequency in ("daily", "weekly", "monthly") else "daily", on)
    row = db.scalar(select(ChallengeProgress).where(ChallengeProgress.challenge_id == ch.id, ChallengeProgress.period_start == ps))
    if done and row is None:
        db.add(ChallengeProgress(user_id=ch.user_id, challenge_id=ch.id, period_start=ps, value=1, completed=True))
    elif not done and row is not None:
        db.delete(row)


