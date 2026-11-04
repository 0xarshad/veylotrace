"""Expense intelligence: deterministic, explainable rules over stored expenses/budgets (no LLM involved)."""

import statistics
from collections import defaultdict
from datetime import date, timedelta
import re

from sqlalchemy.orm import Session

from app.services.analytics import budget_status, category_names, expenses_in, finance_summary, previous_range

FOOD_NAMES = {"food", "groceries", "dining", "restaurants"}


def _norm(desc: str) -> str:
    return re.sub(r"[^a-z]+", " ", desc.lower()).strip()


def expense_insights(db: Session, uid: int, start: date, end: date) -> list[dict]:
    insights: list[dict] = []
    names = category_names(db, uid)
    cur = expenses_in(db, uid, start, end)
    history = expenses_in(db, uid, start - timedelta(days=90), end)

    # 1. budget overruns / categories exceeding planned allocations
    for b in budget_status(db, uid, end):
        if b["status"] == "over":
            kind = "category_over_budget" if b["category_id"] else "budget_overrun"
            insights.append({"type": kind, "severity": "high", "title": f"{b['category']} {b['period']} budget exceeded",
                             "detail": f"Spent {b['spent']} of {b['amount']} ({b['pct']}%) between {b['start']} and {b['end']}.", "data": b})
        elif b["status"] == "warning":
            insights.append({"type": "budget_warning", "severity": "medium", "title": f"{b['category']} {b['period']} budget nearly used",
                             "detail": f"{b['pct']}% of {b['amount']} used between {b['start']} and {b['end']}.", "data": b})

    # 2. unusual purchases: compared with the same category's recent history
    by_cat: dict[int | None, list[float]] = defaultdict(list)
    for e in history:
        if e.occurred_at.date() < start:
            by_cat[e.category_id].append(float(e.amount))
    for e in cur:
        base = by_cat.get(e.category_id, [])
        if len(base) < 5:
            continue
        mean, sd, med = statistics.fmean(base), statistics.pstdev(base), statistics.median(base)
        amt = float(e.amount)
        if amt > mean + 3 * sd and amt > 2 * med:
            insights.append({"type": "unusual_purchase", "severity": "medium", "title": f"Unusually large {names.get(e.category_id, 'uncategorised')} purchase",
                             "detail": f"{amt:.2f} on {e.occurred_at.date()} ('{e.description or 'no description'}') vs typical {med:.2f} in this category over the previous 90 days.",
                             "data": {"expense_id": e.id, "amount": amt, "median": round(med, 2)}})

    # 3. food spending increase vs previous equal period
    fin, prev = finance_summary(db, uid, start, end), finance_summary(db, uid, *previous_range(start, end, "custom"))
    food_now = sum(c["amount"] for c in fin["by_category"] if c["name"].lower() in FOOD_NAMES)
    food_prev = sum(c["amount"] for c in prev["by_category"] if c["name"].lower() in FOOD_NAMES)
    if food_prev > 0 and food_now > food_prev * 1.2 and food_now - food_prev >= 1:
        insights.append({"type": "food_spending_increase", "severity": "medium", "title": "Food spending increased",
                         "detail": f"Food spending {food_now:.2f} vs {food_prev:.2f} in the previous equal period (+{100 * (food_now - food_prev) / food_prev:.0f}%).",
                         "data": {"current": food_now, "previous": food_prev}})

    # 4. frequent small transactions
    amounts = [float(e.amount) for e in history]
    if len(amounts) >= 10:
        cutoff = 0.25 * statistics.median(amounts)
        small = [e for e in cur if float(e.amount) <= cutoff]
        small_total = sum(float(e.amount) for e in small)
        total = float(fin["expenses_total"]) or 1
        if len(small) >= 10 and small_total / total >= 0.05:
            insights.append({"type": "frequent_small_transactions", "severity": "low", "title": "Many small purchases",
                             "detail": f"{len(small)} purchases of {cutoff:.2f} or less add up to {small_total:.2f} ({100 * small_total / total:.0f}% of spending).",
                             "data": {"count": len(small), "total": round(small_total, 2), "threshold": round(cutoff, 2)}})

    # 5. recurring expenses (same description, similar amount, regular cadence)
    groups: dict[str, list] = defaultdict(list)
    for e in history:
        if e.description:
            groups[_norm(e.description)].append(e)
    for key, items in groups.items():
        if len(items) < 3 or not key:
            continue
        items.sort(key=lambda x: x.occurred_at)
        amts = [float(i.amount) for i in items]
        if max(amts) > min(amts) * 1.1:
            continue
        gaps = [(b.occurred_at - a.occurred_at).days for a, b in zip(items, items[1:])]
        g = statistics.median(gaps)
        cadence = "weekly" if 6 <= g <= 8 else "monthly" if 27 <= g <= 34 else "fortnightly" if 13 <= g <= 15 else None
        if cadence and all(abs(x - g) <= 4 for x in gaps):
            insights.append({"type": "recurring_expense", "severity": "info", "title": f"Recurring {cadence} expense: {items[-1].description}",
                             "detail": f"{len(items)} charges of about {statistics.fmean(amts):.2f}, last on {items[-1].occurred_at.date()}.",
                             "data": {"description": items[-1].description, "cadence": cadence, "amount": round(statistics.fmean(amts), 2)}})

    # 6. essential vs non-essential split
    total = fin["essential"] + fin["non_essential"]
    if total > 0:
        insights.append({"type": "essential_split", "severity": "info", "title": "Essential vs non-essential spending",
                         "detail": f"Essential {fin['essential']:.2f} ({100 * fin['essential'] / total:.0f}%), non-essential {fin['non_essential']:.2f} ({100 * fin['non_essential'] / total:.0f}%).",
                         "data": {"essential": fin["essential"], "non_essential": fin["non_essential"]}})
    return insights


