from datetime import time, timedelta

from app.core.clock import business_datetime
from tests.conftest import TEST_NOW, login, make_restaurant, make_user, open_session

API = "/api/v1"
NOON = business_datetime(TEST_NOW.date(), time(12, 0))


def order_payload(session_id, menu):
    return {"session_id": session_id, "items": [{"menu_item_id": str(menu["pasta"].id), "quantity": 1}]}


def test_create_draft_session_hidden_from_employees(client, db, admin_headers, menu):
    make_user(db, "sara")
    response = client.post(
        f"{API}/sessions",
        json={"restaurant_id": str(menu["restaurant"].id), "closes_at": NOON.isoformat()},
        headers=admin_headers,
    )
    assert response.status_code == 201
    session = response.json()
    assert session["status"] == "DRAFT"
    assert session["session_date"] == TEST_NOW.date().isoformat()

    employee_today = client.get(f"{API}/sessions/today", headers=login(client, "sara")).json()
    assert employee_today["session"] is None
    assert employee_today["accepting_reason"] == "NO_SESSION"
    admin_today = client.get(f"{API}/sessions/today", headers=admin_headers).json()
    assert admin_today["session"]["id"] == session["id"]


def test_only_one_active_session_per_date(client, admin_headers, menu):
    open_session(client, admin_headers, menu["restaurant"].id)
    second = client.post(
        f"{API}/sessions",
        json={"restaurant_id": str(menu["restaurant"].id), "closes_at": NOON.isoformat()},
        headers=admin_headers,
    )
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "SESSION_EXISTS"


def test_cancelled_session_frees_the_date(client, admin_headers, menu):
    session = open_session(client, admin_headers, menu["restaurant"].id)
    client.post(
        f"{API}/sessions/{session['id']}/cancel", json={"reason": "Office closed"}, headers=admin_headers
    )
    again = client.post(
        f"{API}/sessions",
        json={"restaurant_id": str(menu["restaurant"].id), "closes_at": NOON.isoformat()},
        headers=admin_headers,
    )
    assert again.status_code == 201


def test_restaurant_without_menu_cannot_be_selected(client, admin_headers, db):
    from app.models import Restaurant

    empty = Restaurant(name="Empty Place")
    db.add(empty)
    db.commit()
    response = client.post(
        f"{API}/sessions",
        json={"restaurant_id": str(empty.id), "closes_at": NOON.isoformat()},
        headers=admin_headers,
    )
    assert response.json()["error"]["code"] == "RESTAURANT_MENU_EMPTY"


def test_deadline_must_be_in_future(client, admin_headers, menu):
    response = client.post(
        f"{API}/sessions",
        json={
            "restaurant_id": str(menu["restaurant"].id),
            "closes_at": (TEST_NOW - timedelta(hours=1)).isoformat(),
            "open_now": True,
        },
        headers=admin_headers,
    )
    assert response.status_code == 422


def test_state_machine_transitions(client, admin_headers, menu):
    session = open_session(client, admin_headers, menu["restaurant"].id)
    sid = session["id"]
    assert session["status"] == "OPEN"
    assert (
        client.post(f"{API}/sessions/{sid}/finalize", headers=admin_headers).json()["error"]["code"]
        == "SESSION_STILL_OPEN"
    )
    assert client.post(f"{API}/sessions/{sid}/close", headers=admin_headers).json()["status"] == "CLOSED"
    # Reopen with an extended deadline.
    reopened = client.post(
        f"{API}/sessions/{sid}/open",
        json={"closes_at": (NOON + timedelta(minutes=30)).isoformat()},
        headers=admin_headers,
    )
    assert reopened.json()["status"] == "OPEN"
    client.post(f"{API}/sessions/{sid}/close", headers=admin_headers)
    assert (
        client.post(f"{API}/sessions/{sid}/finalize", headers=admin_headers).json()["status"] == "FINALIZED"
    )
    assert client.post(f"{API}/sessions/{sid}/open", headers=admin_headers).status_code == 409
    assert (
        client.post(
            f"{API}/sessions/{sid}/cancel", json={"reason": "late"}, headers=admin_headers
        ).status_code
        == 409
    )


def test_finalized_session_locked_unless_override(client, admin_headers, menu):
    sid = open_session(client, admin_headers, menu["restaurant"].id)["id"]
    client.post(f"{API}/sessions/{sid}/close", headers=admin_headers)
    client.post(f"{API}/sessions/{sid}/finalize", headers=admin_headers)
    locked = client.patch(f"{API}/sessions/{sid}", json={"delivery_fee": "30.00"}, headers=admin_headers)
    assert locked.json()["error"]["code"] == "SESSION_FINALIZED"
    no_reason = client.patch(
        f"{API}/sessions/{sid}", json={"delivery_fee": "30.00", "admin_override": True}, headers=admin_headers
    )
    assert no_reason.json()["error"]["code"] == "REASON_REQUIRED"
    ok = client.patch(
        f"{API}/sessions/{sid}",
        json={"delivery_fee": "30.00", "admin_override": True, "reason": "Receipt arrived"},
        headers=admin_headers,
    )
    assert ok.json()["delivery_fee"] == "30.00"
    logs = client.get(f"{API}/admin/audit-logs", params={"entity_id": sid}, headers=admin_headers).json()
    assert any(entry["action"] == "SESSION_ADMIN_OVERRIDE" for entry in logs["items"])


def test_changing_restaurant_with_orders_requires_explicit_cancel(client, db, admin_headers, menu):
    other = make_restaurant(db, "Restaurant B")
    make_user(db, "sara")
    sid = open_session(client, admin_headers, menu["restaurant"].id)["id"]
    headers = login(client, "sara")
    assert client.post(f"{API}/orders", json=order_payload(sid, menu), headers=headers).status_code == 201

    blocked = client.patch(
        f"{API}/sessions/{sid}", json={"restaurant_id": str(other["restaurant"].id)}, headers=admin_headers
    )
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "SESSION_HAS_ORDERS"
    assert blocked.json()["error"]["details"]["order_count"] == 1

    changed = client.patch(
        f"{API}/sessions/{sid}",
        json={
            "restaurant_id": str(other["restaurant"].id),
            "existing_orders_action": "cancel",
            "reason": "Restaurant A is closed today",
        },
        headers=admin_headers,
    )
    assert changed.status_code == 200
    assert changed.json()["restaurant"]["name"] == "Restaurant B"
    mine = client.get(f"{API}/orders/me/today", headers=headers).json()
    assert mine is None
    history = client.get(f"{API}/orders/me/history", headers=headers).json()
    assert history["items"][0]["status"] == "CANCELLED"


def test_cancel_session_cancels_orders(client, db, admin_headers, menu):
    make_user(db, "sara")
    sid = open_session(client, admin_headers, menu["restaurant"].id)["id"]
    headers = login(client, "sara")
    client.post(f"{API}/orders", json=order_payload(sid, menu), headers=headers)
    cancelled = client.post(f"{API}/sessions/{sid}/cancel", json={"reason": "Holiday"}, headers=admin_headers)
    assert cancelled.json()["status"] == "CANCELLED"
    orders = client.get(
        f"{API}/admin/sessions/{sid}/orders", params={"include_cancelled": True}, headers=admin_headers
    ).json()
    assert [o["status"] for o in orders["orders"]] == ["CANCELLED"]


def test_session_history_has_stats(client, db, admin_headers, menu):
    make_user(db, "sara")
    make_user(db, "omar")
    sid = open_session(client, admin_headers, menu["restaurant"].id)["id"]
    client.post(f"{API}/orders", json=order_payload(sid, menu), headers=login(client, "sara"))
    history = client.get(f"{API}/sessions/history", headers=admin_headers).json()
    stats = history["items"][0]["stats"]
    assert stats == {
        "participants": 2,
        "ordered": 1,
        "not_ordered": 1,
        "total_items": 1,
        "total_value": "185.00",
    }


def test_scheduled_open_not_accepting_before_opening_time(client, db, admin_headers, menu):
    make_user(db, "sara")
    response = client.post(
        f"{API}/sessions",
        json={
            "restaurant_id": str(menu["restaurant"].id),
            "opens_at": (TEST_NOW + timedelta(hours=1)).isoformat(),
            "closes_at": (NOON + timedelta(hours=1)).isoformat(),
        },
        headers=admin_headers,
    )
    sid = response.json()["id"]
    client.post(f"{API}/sessions/{sid}/open", headers=admin_headers)
    headers = login(client, "sara")
    today = client.get(f"{API}/sessions/today", headers=headers).json()
    assert today["is_accepting_orders"] is False
    assert today["accepting_reason"] == "ORDERING_NOT_STARTED"
    rejected = client.post(f"{API}/orders", json=order_payload(sid, menu), headers=headers)
    assert rejected.json()["error"]["code"] == "ORDERING_NOT_STARTED"
