"""Per-user data portability: full JSON export, module CSV export, validated + de-duplicated JSON import."""

import csv
import io
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Float, Integer, JSON, Numeric, String, Text, inspect, select
from sqlalchemy.orm import Session

from app.core.errors import bad_request
from app.core.security import utcnow
from app.models import (
    Book, Budget, Challenge, ChallengeBadge, ChallengeProgress, Course, ExerciseEntry, Expense, ExpenseCategory, FoodItem, Goal, HabitLog, Income, Meal, MealItem,
    Milestone, ReadingSession, SavingsContribution, SavingsGoal, ScreenTimeLog, Skill, SleepLog, SocialActivity, StepLog, StudySession, Task, Transfer, WaterIntake, WeightLog,
    WorkoutSession,
)

FORMAT = "veylotrace-export"
VERSION = 1
MAX_ROWS_PER_TABLE = 200_000

# Dependency order matters for FK remapping on import.
ORDER = [ExpenseCategory, SavingsGoal, Budget, Expense, Income, Transfer, SavingsContribution, Goal, Milestone, Task, WorkoutSession, ExerciseEntry, StepLog, SleepLog, WeightLog,
         FoodItem, Meal, MealItem, WaterIntake, Book, ReadingSession, ScreenTimeLog, HabitLog, Skill, Course, StudySession, SocialActivity, Challenge, ChallengeProgress, ChallengeBadge]
BY_TABLE = {m.__tablename__: m for m in ORDER}
SKIP_COLS = {"id", "user_id", "created_at", "updated_at", "deleted_at"}


def _cols(model):
    return {c.key: c.columns[0] for c in inspect(model).mapper.column_attrs}


def _fks(model) -> dict[str, str]:
    """column -> referenced table"""
    return {fk.parent.key: fk.column.table.name for fk in model.__table__.foreign_keys if fk.parent.key != "user_id"}


def _jsonable(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    return v


def export_user(db: Session, uid: int, include_deleted: bool = False) -> dict:
    tables: dict[str, list[dict]] = {}
    for model in ORDER:
        stmt = select(model).where(model.user_id == uid)
        if hasattr(model, "deleted_at") and not include_deleted:
            stmt = stmt.where(model.deleted_at.is_(None))
        cols = _cols(model)
        rows = []
        for obj in db.scalars(stmt.order_by(model.id)):
            row = {k: _jsonable(getattr(obj, k)) for k in cols if k not in {"user_id", "updated_at"}}
            rows.append(row)
        tables[model.__tablename__] = rows
    return {"format": FORMAT, "version": VERSION, "exported_at": utcnow().isoformat(), "tables": tables}


# ---------------- CSV ----------------
def csv_safe(v):
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return "" if v is None else v


def export_csv(db: Session, uid: int, table: str) -> str:
    model = BY_TABLE.get(table)
    if model is None:
        raise bad_request("Unknown module.")
    cols = ["id"] + [c for c in _cols(model) if c not in {"id", "user_id", "updated_at"}]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    stmt = select(model).where(model.user_id == uid)
    if hasattr(model, "deleted_at"):
        stmt = stmt.where(model.deleted_at.is_(None))
    for obj in db.scalars(stmt.order_by(model.id)):
        w.writerow([csv_safe(_jsonable(getattr(obj, c))) for c in cols])
    return buf.getvalue()


# ---------------- import ----------------
def _coerce(col, value):
    if value is None:
        return None
    t = col.type
    try:
        if isinstance(t, DateTime):
            dt = datetime.fromisoformat(str(value))
            return dt.replace(tzinfo=None) if dt.tzinfo else dt
        if isinstance(t, Date):
            return date.fromisoformat(str(value)[:10])
        if isinstance(t, Float):  # Float subclasses Numeric, so it must be tested first
            return float(value)
        if isinstance(t, Numeric):
            return Decimal(str(value))
        if isinstance(t, Boolean):
            if not isinstance(value, bool):
                raise ValueError
            return value
        if isinstance(t, Integer):
            if isinstance(value, bool):
                raise ValueError
            return int(value)
        if isinstance(t, JSON):
            if not isinstance(value, (dict, list)):
                raise ValueError
            return value
        if isinstance(t, (String, Text)):
            s = str(value)
            if isinstance(t, String) and t.length and len(s) > t.length:
                raise ValueError
            return s
    except (ValueError, ArithmeticError):
        raise ValueError(f"bad value for {col.name}")
    return value


def _norm(v):
    if isinstance(v, Decimal):
        return format(v.quantize(Decimal("0.01")), "f")
    if isinstance(v, float):
        return round(v, 6)
    if isinstance(v, datetime):
        return v.replace(microsecond=0)
    return v


def _key(values: dict) -> tuple:
    return tuple(sorted((k, _norm(v) if not isinstance(v, (list, dict)) else repr(v)) for k, v in values.items()))


def _row_values(raw: dict, cols: dict, fks: dict[str, str], data_cols: list[str], idmap: dict) -> dict:
    values: dict = {}
    for c in data_cols:
        col, v = cols[c], raw.get(c)
        if c in fks:
            mapped = idmap[fks[c]].get(v) if isinstance(v, int) and not isinstance(v, bool) else None
            if mapped is None and not col.nullable:
                raise ValueError(f"unresolved reference in {c}")
            values[c] = mapped  # dangling optional references are dropped
        elif v is None:
            default = getattr(col.default, "arg", None) if col.default is not None else None
            if col.nullable:
                values[c] = None
            elif default is not None and not callable(default):
                values[c] = default
            else:
                raise ValueError(f"{c} is required")
        else:
            values[c] = _coerce(col, v)
    return values


def import_user(db: Session, uid: int, payload: dict, dry_run: bool = False) -> dict:
    if not isinstance(payload, dict) or payload.get("format") != FORMAT:
        raise bad_request("This file is not a VeyloTrace export.", "invalid_import")
    if payload.get("version") != VERSION:
        raise bad_request(f"Unsupported export version (expected {VERSION}).", "invalid_import")
    tables = payload.get("tables")
    if not isinstance(tables, dict):
        raise bad_request("Export file has no tables.", "invalid_import")
    unknown = set(tables) - set(BY_TABLE)
    if unknown:
        raise bad_request(f"Unknown tables in file: {', '.join(sorted(map(str, unknown))[:5])}", "invalid_import")

    idmap: dict[str, dict[int, int]] = {t: {} for t in BY_TABLE}
    report: dict[str, dict] = {}
    errors: list[str] = []
    for model in ORDER:
        name = model.__tablename__
        rows = tables.get(name, [])
        if rows in (None, []):
            continue
        if not isinstance(rows, list) or len(rows) > MAX_ROWS_PER_TABLE:
            raise bad_request(f"Table '{name}' is invalid or too large.", "invalid_import")
        cols = _cols(model)
        fks = _fks(model)
        data_cols = [c for c in cols if c not in SKIP_COLS]
        existing: dict[tuple, int] = {}
        for obj in db.scalars(select(model).where(model.user_id == uid)):
            existing.setdefault(_key({c: getattr(obj, c) for c in data_cols}), obj.id)
        stat = {"imported": 0, "duplicates": 0, "invalid": 0}
        # self-referencing rows (sub-categories) must come after their parents
        ordered = sorted((r for r in rows if isinstance(r, dict)), key=lambda r: 0 if r.get("parent_id") is None else 1)
        stat["invalid"] += len(rows) - len(ordered)
        for raw in ordered:
            try:
                values = _row_values(raw, cols, fks, data_cols, idmap)
                key = _key(values)
            except (ValueError, TypeError) as exc:
                stat["invalid"] += 1
                if len(errors) < 10:
                    errors.append(f"{name}: {exc}")
                continue
            old_id = raw.get("id")
            if key in existing:
                stat["duplicates"] += 1
                if isinstance(old_id, int):
                    idmap[name][old_id] = existing[key]
                continue
            if not dry_run:
                obj = model(user_id=uid, **values)
                db.add(obj)
                db.flush()
                new_id = obj.id
            else:
                new_id = -len(existing) - 1  # placeholder so dependants resolve in dry-run
            existing[key] = new_id
            if isinstance(old_id, int):
                idmap[name][old_id] = new_id
            stat["imported"] += 1
        report[name] = stat
    if dry_run:
        db.rollback()
    else:
        db.commit()
    return {"dry_run": dry_run, "tables": report, "totals": {k: sum(t[k] for t in report.values()) for k in ("imported", "duplicates", "invalid")}, "errors": errors}

