from datetime import date, datetime, timedelta

import pytest

NOW = datetime.now().replace(microsecond=0)
TODAY = date.today()
ISO = NOW.isoformat()


def payloads():
    """resource -> (create payload, patch payload, search term present in created payload, date field)"""
    return {
        "expenses": ({"occurred_at": ISO, "amount": "125.50", "description": "Lunch zebra", "payment_method": "card", "necessity": "essential"}, {"amount": "99.99"}, "zebra", "occurred_at"),
        "income": ({"occurred_at": ISO, "amount": "5000", "source_type": "freelance", "description": "Gig zebra"}, {"amount": "5100"}, "zebra", "occurred_at"),
        "transfers": ({"occurred_at": ISO, "amount": "300", "from_account": "Checking", "to_account": "Zebra Savings"}, {"amount": "310"}, "zebra", "occurred_at"),
        "budgets": ({"period": "monthly", "amount": "20000", "name": "Zebra budget"}, {"amount": "21000"}, "zebra", None),
        "savings-goals": ({"name": "Zebra fund", "target_amount": "1000", "planned_monthly_contribution": "100"}, {"target_amount": "2000"}, "zebra", None),
        "savings-contributions": ({"occurred_at": ISO, "amount": "50", "notes": "zebra"}, {"amount": "75"}, "zebra", "occurred_at"),
        "workouts": ({"kind": "gym", "performed_at": ISO, "duration_min": 45, "notes": "zebra", "exercises": [{"name": "Squat", "muscle_group": "legs", "sets": 3, "reps": 5, "weight_kg": 100}]}, {"duration_min": 50}, "zebra", "performed_at"),
        "steps": ({"log_date": TODAY.isoformat(), "steps": 8000, "notes": "zebra"}, {"steps": 9000}, "zebra", "log_date"),
        "sleep": ({"bedtime": (NOW - timedelta(hours=8)).isoformat(), "wake_time": ISO, "quality": 4, "notes": "zebra"}, {"quality": 5}, "zebra", "wake_time"),
        "foods": ({"name": "Zebra rice", "calories": 130, "protein_g": 2.7}, {"calories": 140}, "zebra", None),
        "meals": ({"meal_type": "lunch", "eaten_at": ISO, "name": "Zebra bowl", "items": [{"name": "Rice", "quantity": 2, "calories": 130, "protein_g": 2.7}]}, {"name": "Zebra bowl 2"}, "zebra", "eaten_at"),
        "water": ({"logged_at": ISO, "amount_ml": 250}, {"amount_ml": 500}, None, "logged_at"),
        "books": ({"title": "Zebra Tales", "author": "A. Author", "total_pages": 300}, {"total_pages": 320}, "zebra", None),
        "reading": ({"read_at": ISO, "pages": 20, "duration_min": 30, "notes": "zebra"}, {"pages": 25}, "zebra", "read_at"),
        "screen-time": ({"log_date": TODAY.isoformat(), "duration_min": 90, "app_category": "Zebra video", "classification": "entertainment"}, {"duration_min": 60}, "zebra", "log_date"),
        "habits": ({"log_date": TODAY.isoformat(), "name": "Zebra stretch", "completed": True}, {"completed": False}, "zebra", "log_date"),
        "tasks": ({"name": "Zebra task", "priority": "high", "due_date": TODAY.isoformat()}, {"status": "completed"}, "zebra", "due_date"),
        "goals": ({"name": "Zebra goal", "target_date": (TODAY + timedelta(days=30)).isoformat(), "milestones": [{"title": "m1"}, {"title": "m2"}]}, {"progress": 10}, "zebra", "target_date"),
        "skills": ({"name": "Zebra skill"}, {"level": "advanced"}, "zebra", None),
        "courses": ({"name": "Zebra course", "provider": "Edu"}, {"progress": 50}, "zebra", None),
        "study": ({"studied_at": ISO, "subject": "Zebra studies", "duration_min": 60}, {"duration_min": 90}, "zebra", "studied_at"),
        "social": ({"kind": "friends", "activity": "Zebra dinner", "occurred_at": ISO, "duration_min": 120}, {"duration_min": 150}, "zebra", "occurred_at"),
        "expense-categories": ({"name": "Zebra category"}, {"name": "Zebra category 2"}, "zebra", None),
    }


RESOURCES = list(payloads())


@pytest.mark.parametrize("res", RESOURCES)
def test_full_crud_cycle(client, user_a, res):
    create, patch, term, date_field = payloads()[res]
    r = client.post(f"/api/{res}", json=create, headers=user_a)
    assert r.status_code == 201, r.text
    item = r.json()
    rid = item["id"]
    assert client.get(f"/api/{res}/{rid}", headers=user_a).json()["id"] == rid

    # update
    r = client.patch(f"/api/{res}/{rid}", json=patch, headers=user_a)
    assert r.status_code == 200, r.text
    for k, v in patch.items():
        got = r.json()[k]
        assert str(got) == str(v) or float(got) == float(v), (k, got, v)

    # list + search + date filter
    listing = client.get(f"/api/{res}", headers=user_a).json()
    assert listing["total"] >= 1 and any(i["id"] == rid for i in listing["items"])
    if term:
        found = client.get(f"/api/{res}", params={"q": term}, headers=user_a).json()
        assert any(i["id"] == rid for i in found["items"])
        none = client.get(f"/api/{res}", params={"q": "no-such-text-xyz"}, headers=user_a).json()
        assert none["total"] == 0
    if date_field:
        inside = client.get(f"/api/{res}", params={"date_from": TODAY.isoformat(), "date_to": TODAY.isoformat()}, headers=user_a).json()
        if res not in ("goals", "tasks"):
            assert any(i["id"] == rid for i in inside["items"])
        outside = client.get(f"/api/{res}", params={"date_to": (TODAY - timedelta(days=5)).isoformat()}, headers=user_a).json()
        assert all(i["id"] != rid for i in outside["items"])

    # soft delete + restore
    assert client.delete(f"/api/{res}/{rid}", headers=user_a).status_code == 200
    assert client.get(f"/api/{res}/{rid}", headers=user_a).status_code == 404
    assert all(i["id"] != rid for i in client.get(f"/api/{res}", headers=user_a).json()["items"])
    assert any(i["id"] == rid for i in client.get(f"/api/{res}", params={"deleted": "true"}, headers=user_a).json()["items"])
    assert client.post(f"/api/{res}/{rid}/restore", headers=user_a).status_code == 200
    assert client.get(f"/api/{res}/{rid}", headers=user_a).status_code == 200
    assert client.delete(f"/api/{res}/{rid}", params={"permanent": "true"}, headers=user_a).status_code == 200
    assert client.get(f"/api/{res}/{rid}", headers=user_a).status_code == 404


@pytest.mark.parametrize("res", RESOURCES)
def test_cross_user_isolation(client, user_a, user_b, res):
    create = payloads()[res][0]
    rid = client.post(f"/api/{res}", json=create, headers=user_a).json()["id"]
    assert client.get(f"/api/{res}/{rid}", headers=user_b).status_code == 404
    assert client.patch(f"/api/{res}/{rid}", json={}, headers=user_b).status_code == 404
    assert client.put(f"/api/{res}/{rid}", json={}, headers=user_b).status_code == 404
    assert client.delete(f"/api/{res}/{rid}", headers=user_b).status_code == 404
    assert client.delete(f"/api/{res}/{rid}", params={"permanent": "true"}, headers=user_b).status_code == 404
    assert client.post(f"/api/{res}/{rid}/restore", headers=user_b).status_code == 404
    assert client.post(f"/api/{res}/{rid}/duplicate", headers=user_b).status_code in (404, 405)
    assert all(i["id"] != rid for i in client.get(f"/api/{res}", headers=user_b).json()["items"])
    assert client.get(f"/api/{res}/{rid}", headers=user_a).status_code == 200  # untouched


@pytest.mark.parametrize("res", RESOURCES)
def test_unauthenticated_access_denied(client, res):
    assert client.get(f"/api/{res}").status_code == 401
    assert client.post(f"/api/{res}", json=payloads()[res][0]).status_code == 401
    assert client.delete(f"/api/{res}/1").status_code == 401


def test_client_cannot_set_user_id(client, user_a, user_b):
    me_b = client.get("/api/auth/me", headers=user_b).json()["id"]
    r = client.post("/api/expenses", json={"occurred_at": ISO, "amount": "5", "user_id": me_b}, headers=user_a)
    assert r.status_code == 422
    r = client.post("/api/expenses", json={"occurred_at": ISO, "amount": "5"}, headers=user_a)
    exp_id = r.json()["id"]
    assert client.patch(f"/api/expenses/{exp_id}", json={"user_id": me_b}, headers=user_a).status_code == 422
    assert client.get(f"/api/expenses/{exp_id}", headers=user_b).status_code == 404


def test_foreign_references_rejected(client, user_a, user_b):
    cat_b = client.post("/api/expense-categories", json={"name": "Private"}, headers=user_b).json()["id"]
    r = client.post("/api/expenses", json={"occurred_at": ISO, "amount": "5", "category_id": cat_b}, headers=user_a)
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_reference"
    book_b = client.post("/api/books", json={"title": "Secret"}, headers=user_b).json()["id"]
    assert client.post("/api/reading", json={"read_at": ISO, "book_id": book_b, "pages": 5}, headers=user_a).status_code == 422
    food_b = client.post("/api/foods", json={"name": "Secret food"}, headers=user_b).json()["id"]
    r = client.post("/api/meals", json={"meal_type": "lunch", "eaten_at": ISO, "items": [{"name": "x", "food_item_id": food_b}]}, headers=user_a)
    assert r.status_code == 422


def test_validation_rules(client, user_a):
    assert client.post("/api/expenses", json={"occurred_at": ISO, "amount": "-5"}, headers=user_a).status_code == 422
    assert client.post("/api/expenses", json={"occurred_at": ISO, "amount": "0"}, headers=user_a).status_code == 422
    assert client.post("/api/expenses", json={"occurred_at": ISO, "amount": "1.234"}, headers=user_a).status_code == 422
    assert client.post("/api/expenses", json={"occurred_at": ISO, "amount": "5", "payment_method": "bitcoin"}, headers=user_a).status_code == 422
    assert client.post("/api/transfers", json={"occurred_at": ISO, "amount": "5", "from_account": "A", "to_account": "a"}, headers=user_a).status_code == 422
    assert client.post("/api/sleep", json={"bedtime": ISO, "wake_time": (NOW - timedelta(hours=1)).isoformat()}, headers=user_a).status_code == 422
    assert client.post("/api/budgets", json={"period": "custom", "amount": "10"}, headers=user_a).status_code == 422
    assert client.post("/api/sleep", json={"bedtime": ISO}, headers=user_a).status_code == 422
    assert client.get("/api/expenses", params={"sort": "user_id"}, headers=user_a).status_code == 400
    assert client.get("/api/expenses", params={"limit": 100000}, headers=user_a).status_code == 422


def test_steps_unique_per_date(client, user_a):
    body = {"log_date": TODAY.isoformat(), "steps": 100}
    assert client.post("/api/steps", json=body, headers=user_a).status_code == 201
    assert client.post("/api/steps", json=body, headers=user_a).status_code == 409


def test_sleep_duration_computed(client, user_a):
    r = client.post("/api/sleep", json={"bedtime": (NOW - timedelta(hours=7, minutes=30)).isoformat(), "wake_time": ISO}, headers=user_a).json()
    assert r["duration_min"] == 450


def test_expense_duplicate_and_subcategory_rules(client, user_a):
    cats = client.get("/api/expense-categories", headers=user_a).json()["items"]
    assert {"Food", "Travel", "Miscellaneous"} <= {c["name"] for c in cats}
    food = next(c for c in cats if c["name"] == "Food")
    sub = client.post("/api/expense-categories", json={"name": "Snacks", "parent_id": food["id"]}, headers=user_a).json()
    assert client.post("/api/expense-categories", json={"name": "snacks", "parent_id": food["id"]}, headers=user_a).status_code == 409
    other = next(c for c in cats if c["name"] == "Travel")
    bad = client.post("/api/expenses", json={"occurred_at": ISO, "amount": "5", "category_id": other["id"], "subcategory_id": sub["id"]}, headers=user_a)
    assert bad.status_code == 422
    ok = client.post("/api/expenses", json={"occurred_at": ISO, "amount": "5", "subcategory_id": sub["id"]}, headers=user_a).json()
    assert ok["category_id"] == food["id"]
    dup = client.post(f"/api/expenses/{ok['id']}/duplicate", headers=user_a)
    assert dup.status_code == 201 and dup.json()["id"] != ok["id"] and dup.json()["amount"] == 5.0


def test_meal_totals_duplicate_and_food_usage(client, user_a):
    food = client.post("/api/foods", json={"name": "Egg", "calories": 70, "protein_g": 6}, headers=user_a).json()
    meal = client.post("/api/meals", json={"meal_type": "breakfast", "eaten_at": ISO, "items": [{"name": "Egg", "food_item_id": food["id"], "quantity": 3, "calories": 70, "protein_g": 6}]}, headers=user_a).json()
    assert meal["totals"]["calories"] == 210 and meal["totals"]["protein_g"] == 18
    assert client.get(f"/api/foods/{food['id']}", headers=user_a).json()["use_count"] == 1
    dup = client.post(f"/api/meals/{meal['id']}/duplicate", json={"meal_type": "snack"}, headers=user_a).json()
    assert dup["meal_type"] == "snack" and dup["totals"]["calories"] == 210 and len(dup["items"]) == 1
    # editing items recalculates totals
    upd = client.patch(f"/api/meals/{meal['id']}", json={"items": [{"name": "Egg", "quantity": 1, "calories": 70}]}, headers=user_a).json()
    assert upd["totals"]["calories"] == 70
    client.delete(f"/api/meals/{dup['id']}", headers=user_a)
    assert client.get(f"/api/foods/{food['id']}", headers=user_a).json()["use_count"] == 0


def test_task_completion_and_goal_progress(client, user_a):
    t = client.post("/api/tasks", json={"name": "T"}, headers=user_a).json()
    assert t["completed_at"] is None
    done = client.patch(f"/api/tasks/{t['id']}", json={"status": "completed"}, headers=user_a).json()
    assert done["completed_at"] is not None
    assert client.patch(f"/api/tasks/{t['id']}", json={"status": "pending"}, headers=user_a).json()["completed_at"] is None
    g = client.post("/api/goals", json={"name": "G", "milestones": [{"title": "a", "completed": True}, {"title": "b"}]}, headers=user_a).json()
    assert g["effective_progress"] == 50.0
    g2 = client.patch(f"/api/goals/{g['id']}", json={"milestones": [{"title": "a", "completed": True}]}, headers=user_a).json()
    assert g2["effective_progress"] == 100.0


def test_book_progress_derived_from_reading_sessions(client, user_a):
    book = client.post("/api/books", json={"title": "B", "total_pages": 200}, headers=user_a).json()
    r1 = client.post("/api/reading", json={"read_at": ISO, "book_id": book["id"], "pages": 50, "duration_min": 30}, headers=user_a).json()
    client.post("/api/reading", json={"read_at": ISO, "book_id": book["id"], "pages": 50, "duration_min": 30}, headers=user_a)
    b = client.get(f"/api/books/{book['id']}", headers=user_a).json()
    assert b["pages_read"] == 100 and b["progress_pct"] == 50.0 and b["reading_minutes"] == 60
    client.delete(f"/api/reading/{r1['id']}", headers=user_a)
    assert client.get(f"/api/books/{book['id']}", headers=user_a).json()["pages_read"] == 50
    done = client.patch(f"/api/books/{book['id']}", json={"status": "completed"}, headers=user_a).json()
    assert done["completed_on"] == TODAY.isoformat()


def test_savings_goal_progress(client, user_a):
    g = client.post("/api/savings-goals", json={"name": "Trip", "target_amount": "1000", "planned_monthly_contribution": "100"}, headers=user_a).json()
    client.post("/api/savings-contributions", json={"occurred_at": ISO, "amount": "400", "goal_id": g["id"]}, headers=user_a)
    got = client.get(f"/api/savings-goals/{g['id']}", headers=user_a).json()
    assert got["contributed"] == 400 and got["remaining"] == 600 and got["progress_pct"] == 40.0
    assert got["projected_completion"] == (TODAY + timedelta(days=180)).isoformat()


def test_subcategory_chosen_as_category_is_normalised(client, user_a):
    food = next(c for c in client.get("/api/expense-categories", headers=user_a).json()["items"] if c["name"] == "Food")
    sub = client.post("/api/expense-categories", json={"name": "Snacks", "parent_id": food["id"]}, headers=user_a).json()
    e = client.post("/api/expenses", json={"occurred_at": ISO, "amount": "5", "category_id": sub["id"]}, headers=user_a).json()
    assert e["category_id"] == food["id"] and e["subcategory_id"] == sub["id"]
