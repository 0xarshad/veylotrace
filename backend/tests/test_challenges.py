from datetime import date, datetime, timedelta

TODAY = date.today()


def at(day: date, hh: int = 12) -> str:
    return datetime(day.year, day.month, day.day, hh, 0).isoformat()


def mk(client, h, **kw):
    body = {"name": "C", "metric": "manual", "frequency": "daily", "start_date": (TODAY - timedelta(days=4)).isoformat(), **kw}
    r = client.post("/api/challenges", json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def test_metrics_catalog(client, user_a):
    m = client.get("/api/challenges/metrics", headers=user_a).json()
    assert {"water_ml", "reading_minutes", "non_essential_spending", "manual"} <= {x["key"] for x in m}


def test_water_challenge_progress_and_streak_derived_from_records(client, user_a):
    ch = mk(client, user_a, name="Water", metric="water_ml", target=2000)
    for i in (1, 2, 3):  # three consecutive past days at target
        client.post("/api/water", json={"logged_at": at(TODAY - timedelta(days=i)), "amount_ml": 2000}, headers=user_a)
    client.post("/api/water", json={"logged_at": at(TODAY - timedelta(days=4)), "amount_ml": 500}, headers=user_a)  # below target
    got = client.get(f"/api/challenges/{ch['id']}", headers=user_a).json()
    assert got["progress"]["current_streak"] == 3 and got["progress"]["longest_streak"] == 3 and got["progress"]["total_met"] == 3
    assert got["progress"]["current"]["status"] == "in_progress"  # today's unfinished period does not break the streak
    assert {b["code"] for b in got["badges"]} == {"first_win", "streak_3"}
    # today reaching target extends the streak; the same record is never counted twice
    r = client.post("/api/water", json={"logged_at": at(TODAY), "amount_ml": 2500}, headers=user_a).json()
    got = client.get(f"/api/challenges/{ch['id']}", headers=user_a).json()
    assert got["progress"]["current_streak"] == 4 and got["progress"]["total_met"] == 4
    # deleting the record is reflected immediately
    client.delete(f"/api/water/{r['id']}", headers=user_a)
    got = client.get(f"/api/challenges/{ch['id']}", headers=user_a).json()
    assert got["progress"]["current_streak"] == 3
    hist = client.get(f"/api/challenges/{ch['id']}/history", headers=user_a).json()
    assert hist["history"][0]["period_start"] == TODAY.isoformat() and len(hist["history"]) == 5


def test_limit_challenge_only_counts_finished_periods(client, user_a):
    ch = mk(client, user_a, name="No wasteful spend", metric="non_essential_spending", target=0)
    client.post("/api/expenses", json={"occurred_at": at(TODAY - timedelta(days=2)), "amount": "50", "necessity": "non_essential"}, headers=user_a)
    client.post("/api/expenses", json={"occurred_at": at(TODAY - timedelta(days=1)), "amount": "50", "necessity": "essential"}, headers=user_a)
    p = client.get(f"/api/challenges/{ch['id']}", headers=user_a).json()["progress"]
    statuses = {h["period_start"]: h["status"] for h in client.get(f"/api/challenges/{ch['id']}/history", headers=user_a).json()["history"]}
    assert statuses[(TODAY - timedelta(days=2)).isoformat()] == "missed"
    assert statuses[(TODAY - timedelta(days=1)).isoformat()] == "met"
    assert statuses[TODAY.isoformat()] == "in_progress"
    assert p["current_streak"] == 1 and p["longest_streak"] == 2


def test_manual_challenge_complete_undo_and_auto_challenges_reject_manual(client, user_a):
    ch = mk(client, user_a)
    assert client.post(f"/api/challenges/{ch['id']}/complete", json={}, headers=user_a).json()["progress"]["total_met"] == 1
    assert client.post(f"/api/challenges/{ch['id']}/complete", json={}, headers=user_a).json()["progress"]["total_met"] == 1  # idempotent
    assert client.post(f"/api/challenges/{ch['id']}/complete", json={"done": False}, headers=user_a).json()["progress"]["total_met"] == 0
    assert client.post(f"/api/challenges/{ch['id']}/complete", json={"date": (TODAY + timedelta(days=1)).isoformat()}, headers=user_a).status_code == 400
    auto = mk(client, user_a, metric="steps", target=5000)
    assert client.post(f"/api/challenges/{auto['id']}/complete", json={}, headers=user_a).status_code == 400


def test_pause_resume_restart(client, user_a):
    ch = mk(client, user_a)
    client.post(f"/api/challenges/{ch['id']}/complete", json={}, headers=user_a)
    paused = client.post(f"/api/challenges/{ch['id']}/pause", headers=user_a).json()
    assert paused["status"] == "paused"
    assert client.post(f"/api/challenges/{ch['id']}/pause", headers=user_a).status_code == 409
    assert client.post(f"/api/challenges/{ch['id']}/complete", json={}, headers=user_a).status_code == 409
    assert client.post(f"/api/challenges/{ch['id']}/resume", headers=user_a).json()["status"] == "active"
    restarted = client.post(f"/api/challenges/{ch['id']}/restart", headers=user_a).json()
    assert restarted["start_date"] == TODAY.isoformat() and restarted["progress"]["total_met"] == 0 and restarted["progress"]["periods_total"] == 1
    assert {b["code"] for b in restarted["badges"]} == {"first_win"}  # earned badges stay as history


def test_weekly_and_monthly_frequency(client, user_a):
    wk = mk(client, user_a, name="W", metric="workout_sessions", frequency="weekly", target=2, start_date=(TODAY - timedelta(days=14)).isoformat())
    for hour in (7, 18):  # same day, so both fall in one calendar week regardless of weekday
        client.post("/api/workouts", json={"kind": "gym", "performed_at": at(TODAY - timedelta(days=8), hour), "duration_min": 30}, headers=user_a)
    hist = client.get(f"/api/challenges/{wk['id']}/history", headers=user_a).json()
    assert hist["total_met"] >= 1 and all(h["period_end"] >= h["period_start"] for h in hist["history"])
    mo = mk(client, user_a, name="M", metric="manual", frequency="monthly", start_date=TODAY.replace(day=1).isoformat())
    assert client.post(f"/api/challenges/{mo['id']}/complete", json={}, headers=user_a).json()["progress"]["total_met"] == 1


def test_challenge_validation_and_isolation(client, user_a, user_b):
    assert client.post("/api/challenges", json={"name": "x", "metric": "bogus", "start_date": TODAY.isoformat()}, headers=user_a).status_code == 422
    assert client.post("/api/challenges", json={"name": "x", "metric": "steps", "start_date": TODAY.isoformat(), "end_date": (TODAY - timedelta(days=1)).isoformat()}, headers=user_a).status_code == 422
    ch = mk(client, user_a)
    for act in ("pause", "resume", "restart", "complete", "history"):
        method = "GET" if act == "history" else "POST"
        assert client.request(method, f"/api/challenges/{ch['id']}/{act}", headers=user_b, json={} if method == "POST" else None).status_code == 404
