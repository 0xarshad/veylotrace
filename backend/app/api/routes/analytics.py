import csv
import io
import json
from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.core.deps import DB, require_permission
from app.core.errors import bad_request
from app.models import User
from app.services import analytics as A
from app.services.daily import timeline
from app.services.insights import expense_insights

perm = Depends(require_permission("tracking:own"))
router = APIRouter(dependencies=[perm], tags=["analytics"])


def _range(db, uid, period: str, anchor: date | None, start: date | None, end: date | None) -> A.Range:
    try:
        return A.resolve_range(period, anchor or date.today(), start, end, A.week_starts_monday(db, uid))
    except ValueError as exc:
        raise bad_request(str(exc))


@router.get("/dashboard")
def dashboard(
    db: DB,
    user: User = perm,
    period: str = Query("month", pattern="^(day|week|month|custom)$"),
    date_: date | None = Query(None, alias="date"),
    start: date | None = None,
    end: date | None = None,
):
    rng = _range(db, user.id, period, date_, start, end)
    day = min(max(date.today(), rng.start), rng.end) if period != "custom" else date.today()
    return A.dashboard(db, user.id, rng.start, rng.end, day)


@router.get("/daily")
def daily(db: DB, user: User = perm, date_: date | None = Query(None, alias="date")):
    return timeline(db, user.id, date_ or date.today())


@router.get("/budgets-status")
def budgets_status(db: DB, user: User = perm, date_: date | None = Query(None, alias="date")):
    return A.budget_status(db, user.id, date_ or date.today())


@router.get("/savings-overview")
def savings(db: DB, user: User = perm):
    return A.savings_overview(db, user.id)


@router.get("/insights/expenses")
def insights(db: DB, user: User = perm, start: date | None = None, end: date | None = None):
    today = date.today()
    s, e = (start or today.replace(day=1)), (end or today)
    if e < s or (e - s).days > 731:
        raise bad_request("Invalid date range.")
    return {"range": {"start": s.isoformat(), "end": e.isoformat()}, "insights": expense_insights(db, user.id, s, e)}


@router.get("/analytics/{section}")
def module_analytics(
    section: str,
    db: DB,
    user: User = perm,
    start: date | None = None,
    end: date | None = None,
):
    """Range-based module analytics used by module pages (health, nutrition, finance, productivity, learning, lifestyle)."""
    today = date.today()
    s, e = (start or today.replace(day=1)), (end or today)
    if e < s or (e - s).days > 3660:
        raise bad_request("Invalid date range.")
    fn = {
        "finance": A.finance_summary, "health": A.health_summary, "nutrition": A.nutrition_summary,
        "productivity": A.productivity_summary, "learning": A.learning_summary, "lifestyle": A.lifestyle_summary,
    }.get(section)
    if fn is None:
        raise bad_request("Unknown analytics section.")
    return fn(db, user.id, s, e)


# ---------------- reports ----------------
def _safe(cell):
    if isinstance(cell, str) and cell[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + cell  # neutralise spreadsheet formula injection
    return cell


def report_rows(rep: dict) -> list[list]:
    rows: list[list] = [["section", "item", "metric", "value"]]

    def walk(path: str, obj) -> None:
        if isinstance(obj, dict):
            for k, v in obj.items():
                if isinstance(v, (dict, list)):
                    walk(f"{path}.{k}" if path else k, v)
                else:
                    rows.append([path, "", k, v])
        elif isinstance(obj, list):
            for idx, entry in enumerate(obj):
                if isinstance(entry, dict):
                    label = entry.get("date") or entry.get("name") or entry.get("week") or str(idx)
                    rows.extend([path, label, k, v] for k, v in entry.items() if not isinstance(v, (dict, list)))
                else:
                    rows.append([path, str(idx), "value", entry])

    walk("", rep)
    return rows


@router.get("/reports/{kind}")
def get_report(kind: str, db: DB, user: User = perm, date_: date | None = Query(None, alias="date")):
    if kind not in ("daily", "weekly", "monthly"):
        raise bad_request("Report kind must be daily, weekly or monthly.")
    return A.report(db, user.id, kind, date_ or date.today())


@router.get("/reports/{kind}/export")
def export_report(kind: str, db: DB, user: User = perm, date_: date | None = Query(None, alias="date"), format: str = Query("csv", pattern="^(csv|json)$")):
    if kind not in ("daily", "weekly", "monthly"):
        raise bad_request("Report kind must be daily, weekly or monthly.")
    rep = A.report(db, user.id, kind, date_ or date.today())
    name = f"veylotrace-{kind}-report-{rep['range']['start']}"
    if format == "json":
        return Response(json.dumps(rep, indent=2), media_type="application/json", headers={"Content-Disposition": f'attachment; filename="{name}.json"'})
    buf = io.StringIO()
    w = csv.writer(buf)
    for row in report_rows(rep):
        w.writerow([_safe(c) for c in row])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})
