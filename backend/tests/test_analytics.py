from datetime import date, datetime, timedelta

TODAY = date.today()


def at(day: date, hh: int = 12) -> str:
    return datetime(day.year, day.month, day.day, hh, 0).isoformat()


def post(client, h, path, body):
    r = client.post(f"/api/{path}", json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def cat_id(client, h, name):
    return next(c["id"] for c in client.get("/api/expense-categories", headers=h).json()["items"] if c["name"] == name)


def dash(client, h, **params):
    r = client.get("/api/dashboard", params=params, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_empty_dashboard_has_no_fabricated_numbers(client, user_a):
    d = dash(client, user_a, period="month")
    assert d["has_data"] is False
    assert d["daily_overview"]["expenses"] == 0 and d["daily_overview"]["calories"] == 0
    assert d["financial"]["expenses_total"] == 0 and d["financial"]["by_category"] == []
    assert d["health"]["workout_count"] == 0 and d["productivity"]["tasks_completed"] == 0


def test_finance_calculations_and_edit_delete_reflected(client, user_a):
    food = cat_id(client, user_a, "Food")
    travel = cat_id(client, user_a, "Travel")
    e1 = post(client, user_a, "expenses", {"occurred_at": at(TODAY), "amount": "100.10", "category_id": food, "necessity": "essential"})
    e2 = post(client, user_a, "expenses", {"occurred_at": at(TODAY), "amount": "50.25", "category_id": travel, "necessity": "non_essential"})
    post(client, user_a, "income", {"occurred_at": at(TODAY), "amount": "1000", "source_type": "salary"})
    post(client, user_a, "savings-contributions", {"occurred_at": at(TODAY), "amount": "200"})
    # transfers between own accounts must never count as expenses
    post(client, user_a, "transfers", {"occurred_at": at(TODAY), "amount": "999", "from_account": "A", "to_account": "B"})

    f = dash(client, user_a, period="day")["financial"]
    assert f["expenses_total"] == 150.35
    assert f["income_total"] == 1000 and f["savings_contributed"] == 200
    assert f["net_cash_flow"] == round(1000 - 150.35 - 200, 2)
    assert {c["name"]: c["amount"] for c in f["by_category"]} == {"Food": 100.1, "Travel": 50.25}
    assert f["essential"] == 100.1 and f["non_essential"] == 50.25

    client.patch(f"/api/expenses/{e1['id']}", json={"amount": "10"}, headers=user_a)
    client.delete(f"/api/expenses/{e2['id']}", headers=user_a)
    f = dash(client, user_a, period="day")["financial"]
    assert f["expenses_total"] == 10 and f["net_cash_flow"] == 790
    client.post(f"/api/expenses/{e2['id']}/restore", headers=user_a)
    assert dash(client, user_a, period="day")["financial"]["expenses_total"] == 60.25


def test_unspent_budget_is_not_savings(client, user_a):
    post(client, user_a, "budgets", {"period": "daily", "amount": "500"})
    post(client, user_a, "expenses", {"occurred_at": at(TODAY), "amount": "120"})
    d = dash(client, user_a, period="day")
    assert d["daily_overview"]["daily_budget"] == 500 and d["daily_overview"]["budget_remaining"] == 380
    assert d["financial"]["savings_contributed"] == 0
    assert d["financial"]["savings"]["total_contributed"] == 0


def test_budget_periods_category_and_status(client, user_a):
    food = cat_id(client, user_a, "Food")
    post(client, user_a, "budgets", {"period": "monthly", "amount": "1000", "name": "Overall"})
    post(client, user_a, "budgets", {"period": "monthly", "amount": "100", "category_id": food})
    post(client, user_a, "budgets", {"period": "custom", "amount": "50", "start_date": TODAY.isoformat(), "end_date": (TODAY + timedelta(days=3)).isoformat()})
    post(client, user_a, "expenses", {"occurred_at": at(TODAY), "amount": "120", "category_id": food})
    st = {(b["period"], b["category"]): b for b in client.get("/api/budgets-status", headers=user_a).json()}
    assert st[("monthly", "Overall")]["spent"] == 120 and st[("monthly", "Overall")]["status"] == "ok"
    assert st[("monthly", "Food")]["status"] == "over" and st[("monthly", "Food")]["remaining"] == -20
    assert st[("custom", "Overall")]["spent"] == 120 and st[("custom", "Overall")]["status"] == "over"
    ins = client.get("/api/insights/expenses", headers=user_a).json()["insights"]
    assert any(i["type"] == "category_over_budget" for i in ins)
    assert any(i["type"] == "budget_overrun" for i in ins)


def test_nutrition_totals_exclude_templates_and_deleted(client, user_a):
    post(client, user_a, "meals", {"meal_type": "lunch", "eaten_at": at(TODAY), "items": [{"name": "Rice", "quantity": 2, "calories": 200, "protein_g": 5}]})
    tmpl = post(client, user_a, "meals", {"meal_type": "dinner", "eaten_at": at(TODAY), "is_template": True, "items": [{"name": "Saved", "calories": 999}]})
    gone = post(client, user_a, "meals", {"meal_type": "snack", "eaten_at": at(TODAY), "items": [{"name": "Chips", "calories": 300}]})
    client.delete(f"/api/meals/{gone['id']}", headers=user_a)
    post(client, user_a, "water", {"logged_at": at(TODAY), "amount_ml": 500})
    post(client, user_a, "water", {"logged_at": at(TODAY), "amount_ml": 250})
    o = dash(client, user_a, period="day")["daily_overview"]
    assert o["calories"] == 400 and o["protein_g"] == 10 and o["water_ml"] == 750
    n = dash(client, user_a, period="day")["nutrition"]
    assert n["target_days_met"]["water"] == 0 and n["days_logged"] == 1
    assert tmpl["is_template"] is True


def test_daily_overview_all_fields(client, user_a):
    post(client, user_a, "workouts", {"kind": "cardio", "performed_at": at(TODAY), "duration_min": 40})
    post(client, user_a, "study", {"studied_at": at(TODAY), "subject": "Math", "duration_min": 90})
    post(client, user_a, "reading", {"read_at": at(TODAY), "pages": 10, "duration_min": 25})
    t = post(client, user_a, "tasks", {"name": "x"})
    client.patch(f"/api/tasks/{t['id']}", json={"status": "completed"}, headers=user_a)
    post(client, user_a, "tasks", {"name": "y"})
    d = dash(client, user_a, period="day")
    o = d["daily_overview"]
    assert (o["workout_minutes"], o["study_minutes"], o["reading_minutes"], o["tasks_completed"]) == (40, 90, 25, 1)
    assert d["productivity"]["tasks_pending"] == 1
    assert d["learning"]["by_subject"][0] == {"name": "Math", "minutes": 90.0}
    assert d["has_data"] is True


def test_dashboard_range_filters(client, user_a):
    old = TODAY - timedelta(days=40)
    post(client, user_a, "expenses", {"occurred_at": at(old), "amount": "70"})
    post(client, user_a, "expenses", {"occurred_at": at(TODAY), "amount": "30"})
    assert dash(client, user_a, period="day")["financial"]["expenses_total"] == 30
    custom = dash(client, user_a, period="custom", start=old.isoformat(), end=TODAY.isoformat())
    assert custom["financial"]["expenses_total"] == 100
    only_old = dash(client, user_a, period="custom", start=(old - timedelta(days=1)).isoformat(), end=(old + timedelta(days=1)).isoformat())
    assert only_old["financial"]["expenses_total"] == 70
    assert client.get("/api/dashboard", params={"period": "custom"}, headers=user_a).status_code == 400
    assert client.get("/api/dashboard", params={"period": "custom", "start": "2026-02-01", "end": "2026-01-01"}, headers=user_a).status_code == 400


def test_dashboard_is_user_scoped(client, user_a, user_b):
    post(client, user_a, "expenses", {"occurred_at": at(TODAY), "amount": "77"})
    assert dash(client, user_a, period="day")["financial"]["expenses_total"] == 77
    b = dash(client, user_b, period="day")
    assert b["financial"]["expenses_total"] == 0 and b["has_data"] is False


def test_savings_goals_projection_and_remaining(client, user_a):
    g = post(client, user_a, "savings-goals", {"name": "Car", "target_amount": "5000", "planned_monthly_contribution": "500"})
    post(client, user_a, "savings-contributions", {"occurred_at": at(TODAY), "amount": "1000", "goal_id": g["id"]})
    s = client.get("/api/savings-overview", headers=user_a).json()
    assert s["total_contributed"] == 1000 and s["goals"][0]["remaining"] == 4000 and s["goals"][0]["progress_pct"] == 20.0


def test_health_summary_progression_and_sleep(client, user_a):
    for d, w in ((TODAY - timedelta(days=7), 60), (TODAY, 70)):
        post(client, user_a, "workouts", {"kind": "gym", "performed_at": at(d), "duration_min": 50, "exercises": [{"name": "Bench", "sets": 3, "reps": 5, "weight_kg": w}]})
    post(client, user_a, "steps", {"log_date": TODAY.isoformat(), "steps": 6000})
    post(client, user_a, "sleep", {"bedtime": (datetime.now() - timedelta(hours=8)).isoformat(), "wake_time": datetime.now().isoformat(), "quality": 4})
    h = client.get("/api/analytics/health", params={"start": (TODAY - timedelta(days=10)).isoformat(), "end": TODAY.isoformat()}, headers=user_a).json()
    assert h["workout_count"] == 2 and h["workout_minutes"] == 100
    assert [p["weight_kg"] for p in h["exercise_progression"]["Bench"]] == [60, 70]
    assert h["steps_average"] == 6000 and h["sleep_avg_hours"] == 8.0


def test_expense_intelligence_unusual_and_recurring(client, user_a):
    food = cat_id(client, user_a, "Food")
    for i in range(1, 7):  # six regular purchases in prior weeks
        post(client, user_a, "expenses", {"occurred_at": at(TODAY - timedelta(days=10 * i)), "amount": "100", "category_id": food, "description": "Gym membership"})
    post(client, user_a, "expenses", {"occurred_at": at(TODAY), "amount": "5000", "category_id": food, "description": "Banquet"})
    ins = client.get("/api/insights/expenses", params={"start": (TODAY - timedelta(days=5)).isoformat(), "end": TODAY.isoformat()}, headers=user_a).json()["insights"]
    types = {i["type"] for i in ins}
    assert "unusual_purchase" in types
    all_ins = client.get("/api/insights/expenses", params={"start": (TODAY - timedelta(days=90)).isoformat(), "end": TODAY.isoformat()}, headers=user_a).json()["insights"]
    assert "essential_split" in {i["type"] for i in all_ins}
    assert not [i for i in all_ins if i["type"] == "recurring_expense"]  # a 10-day cadence is not a recognised schedule
    for i in range(4):
        post(client, user_a, "expenses", {"occurred_at": at(TODAY - timedelta(days=7 * i)), "amount": "15", "description": "Streaming service"})
    rec = [i for i in client.get("/api/insights/expenses", params={"start": (TODAY - timedelta(days=30)).isoformat(), "end": TODAY.isoformat()}, headers=user_a).json()["insights"] if i["type"] == "recurring_expense"]
    assert rec and rec[0]["data"]["cadence"] == "weekly" and rec[0]["data"]["amount"] == 15


def test_reports_daily_weekly_monthly_and_comparison(client, user_a):
    post(client, user_a, "expenses", {"occurred_at": at(TODAY), "amount": "40"})
    prev_month = (TODAY.replace(day=1) - timedelta(days=1)).replace(day=1)
    post(client, user_a, "expenses", {"occurred_at": at(prev_month), "amount": "20"})
    for kind in ("daily", "weekly", "monthly"):
        r = client.get(f"/api/reports/{kind}", headers=user_a)
        assert r.status_code == 200
        assert {"finance", "health", "nutrition", "productivity", "learning", "lifestyle", "comparison"} <= set(r.json())
    m = client.get("/api/reports/monthly", headers=user_a).json()
    assert m["finance"]["expenses_total"] == 40
    assert m["comparison"]["expenses"] == {"current": 40, "previous": 20, "change": 20, "change_pct": 100.0}
    assert client.get("/api/reports/yearly", headers=user_a).status_code == 400


def test_report_exports_csv_and_json(client, user_a):
    post(client, user_a, "expenses", {"occurred_at": at(TODAY), "amount": "40", "description": "=HYPERLINK(\"x\")"})
    j = client.get("/api/reports/monthly/export", params={"format": "json"}, headers=user_a)
    assert j.status_code == 200 and j.json()["finance"]["expenses_total"] == 40
    c = client.get("/api/reports/monthly/export", params={"format": "csv"}, headers=user_a)
    assert c.status_code == 200 and c.text.startswith("section,item,metric,value") and "expenses_total" in c.text
    assert "attachment" in c.headers["content-disposition"]


def test_daily_tracker_timeline_and_indicators(client, user_a):
    post(client, user_a, "expenses", {"occurred_at": at(TODAY, 9), "amount": "12", "description": "Coffee"})
    post(client, user_a, "meals", {"meal_type": "breakfast", "eaten_at": at(TODAY, 8), "items": [{"name": "Oats", "calories": 300}]})
    post(client, user_a, "tasks", {"name": "Pending task", "due_date": TODAY.isoformat()})
    d = client.get("/api/daily", params={"date": TODAY.isoformat()}, headers=user_a).json()
    kinds = [i["type"] for i in d["items"]]
    assert kinds[:2] == ["meal", "expense"] and "task" in kinds
    assert d["pending"] == 1
    assert {m["key"] for m in d["incomplete"]} == {"water", "steps", "sleep"}
    future = client.get("/api/daily", params={"date": (TODAY + timedelta(days=3)).isoformat()}, headers=user_a).json()
    assert future["items"] == []
