"""Preview and permanently clear a user's tracking data by section and date."""

from datetime import date, datetime, time, timedelta

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import bad_request
from app.services import portability as port

SECTIONS = {
    "finance": ["expense_categories", "savings_goals", "budgets", "expenses", "income", "transfers", "savings_contributions"],
    "health": ["workout_sessions", "exercise_entries", "step_logs", "sleep_logs", "weight_logs"],
    "nutrition": ["food_items", "meals", "meal_items", "water_intakes"],
    "productivity": ["goals", "milestones", "tasks"],
    "learning": ["skills", "courses", "study_sessions"],
    "lifestyle": ["books", "reading_sessions", "screen_time_logs", "habit_logs"],
    "social": ["social_activities"],
    "challenges": ["challenges", "challenge_progress", "challenge_badges"],
}

# For date-limited resets, reusable definitions and templates are retained.
DATE_FIELDS = {
    "expenses": ("occurred_at", "datetime"), "income": ("occurred_at", "datetime"),
    "transfers": ("occurred_at", "datetime"), "savings_contributions": ("occurred_at", "datetime"),
    "workout_sessions": ("performed_at", "datetime"), "step_logs": ("log_date", "date"),
    "sleep_logs": ("wake_time", "datetime"), "meals": ("eaten_at", "datetime"),
    "weight_logs": ("log_date", "date"),
    "water_intakes": ("logged_at", "datetime"), "study_sessions": ("studied_at", "datetime"),
    "reading_sessions": ("read_at", "datetime"), "screen_time_logs": ("log_date", "date"),
    "habit_logs": ("log_date", "date"), "social_activities": ("occurred_at", "datetime"),
    "challenge_progress": ("period_start", "date"), "challenge_badges": ("awarded_on", "date"),
}


def _statement(db: Session, uid: int, table: str, start: date | None, end: date | None):
    model = port.BY_TABLE[table]
    stmt = select(model).where(model.user_id == uid)
    if start is None:
        return stmt
    if table == "tasks":
        stmt = stmt.where(or_(model.due_date.between(start, end), model.completed_at.between(datetime.combine(start, time.min), datetime.combine(end + timedelta(days=1), time.min))))
    elif table == "milestones":
        stmt = stmt.where(model.due_date.between(start, end))
    elif table == "exercise_entries":
        workouts = select(port.BY_TABLE["workout_sessions"].id).where(
            port.BY_TABLE["workout_sessions"].user_id == uid,
            port.BY_TABLE["workout_sessions"].performed_at.between(datetime.combine(start, time.min), datetime.combine(end + timedelta(days=1), time.min)),
        )
        stmt = stmt.where(model.workout_id.in_(workouts))
    elif table == "meal_items":
        meals = select(port.BY_TABLE["meals"].id).where(
            port.BY_TABLE["meals"].user_id == uid,
            port.BY_TABLE["meals"].is_template.is_(False),
            port.BY_TABLE["meals"].eaten_at.between(datetime.combine(start, time.min), datetime.combine(end + timedelta(days=1), time.min)),
        )
        stmt = stmt.where(model.meal_id.in_(meals))
    elif table == "meals":
        stmt = stmt.where(model.is_template.is_(False))
        field, kind = DATE_FIELDS[table]
        column = getattr(model, field)
        stmt = stmt.where(column.between(start, end) if kind == "date" else column.between(datetime.combine(start, time.min), datetime.combine(end + timedelta(days=1), time.min)))
    elif table in DATE_FIELDS:
        field, kind = DATE_FIELDS[table]
        column = getattr(model, field)
        stmt = stmt.where(column.between(start, end) if kind == "date" else column.between(datetime.combine(start, time.min), datetime.combine(end + timedelta(days=1), time.min)))
    else:
        # Categories, goals, saved foods/books/skills, budgets and challenge
        # definitions have no reliable activity date and stay during date resets.
        stmt = stmt.where(model.id == -1)
    return stmt


def reset_user_data(db: Session, uid: int, sections: list[str], start: date | None, end: date | None, *, dry_run: bool) -> dict:
    if not sections or len(sections) != len(set(sections)) or any(s not in (*SECTIONS, "all") for s in sections):
        raise bad_request("Choose one or more valid data sections.", "invalid_reset")
    if "all" in sections:
        if len(sections) != 1:
            raise bad_request('Choose "all" by itself or select specific sections.', "invalid_reset")
        sections = list(SECTIONS)
    if (start is None) != (end is None) or (start is not None and start > end):
        raise bad_request("Choose a valid start and end date, or select all dates.", "invalid_reset")

    tables = list(dict.fromkeys(table for section in sections for table in SECTIONS[section]))
    statements = {table: _statement(db, uid, table, start, end) for table in tables}
    counts = {
        table: db.scalar(select(func.count()).select_from(port.BY_TABLE[table]).where(port.BY_TABLE[table].id.in_(stmt.with_only_columns(port.BY_TABLE[table].id).order_by(None)))) or 0
        for table, stmt in statements.items()
    }
    deleted = {table: 0 for table in tables}
    if not dry_run:
        # Child rows first; execute bulk deletes within the caller's transaction.
        for table in reversed([m.__tablename__ for m in port.ORDER if m.__tablename__ in statements]):
            stmt = statements[table]
            result = db.execute(delete(port.BY_TABLE[table]).where(port.BY_TABLE[table].id.in_(stmt.with_only_columns(port.BY_TABLE[table].id).order_by(None))))
            deleted[table] = result.rowcount or 0
        db.flush()
    return {"dry_run": dry_run, "sections": sections, "start": start.isoformat() if start else None,
            "end": end.isoformat() if end else None, "tables": counts if dry_run else deleted,
            "total": sum(counts.values()) if dry_run else sum(deleted.values())}
