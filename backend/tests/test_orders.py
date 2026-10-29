from datetime import timedelta

from tests.conftest import TEST_NOW, login, make_restaurant, make_user, open_session

API = "/api/v1"


def burger_line(menu, qty=1, large=False, cheese=False, note=None):
    modifiers = [menu["large"].id if large else menu["regular"].id]
    if cheese:
        modifiers.append(menu["cheese"].id)
    return {
        "menu_item_id": str(menu["burger"].id),
        "quantity": qty,
        "modifier_ids": [str(m) for m in modifiers],
        "special_instructions": note,
    }


def setup(client, db, admin_headers, menu, users=("sara",)):
    for name in users:
        make_user(db, name)
    session = open_session(client, admin_headers, menu["restaurant"].id)
    return session["id"], {name: login(client, name) for name in users}


def test_submit_order_recalculates_price_server_side(client, db, admin_headers, menu):
    sid, headers = setup(client, db, admin_headers, menu)
    response = client.post(
        f"{API}/orders",
        json={
            "session_id": sid,
            "items": [
                burger_line(menu, 2, large=True, cheese=True, note="No onions"),
                {"menu_item_id": str(menu["fries"].id), "quantity": 1},
            ],
        },
        headers=headers["sara"],
    )
    assert response.status_code == 201, response.text
    order = response.json()
    assert order["total_amount"] == "530.00"  # (180+35+20)*2 + 60
    assert order["item_count"] == 3
    assert order["status"] == "SUBMITTED"
    assert order["reference"].startswith("EMS-")
    assert order["items"][0]["special_instructions"] == "No onions"
    assert order["session"]["restaurant"]["name"] == "Restaurant A"

    today = client.get(f"{API}/sessions/today", headers=headers["sara"]).json()
    assert today["my_order"]["total_amount"] == "530.00"


def test_client_cannot_choose_restaurant(client, db, admin_headers, menu):
    other = make_restaurant(db, "Restaurant B")
    sid, headers = setup(client, db, admin_headers, menu)
    response = client.post(
        f"{API}/orders",
        json={
            "session_id": sid,
            "restaurant_id": str(other["restaurant"].id),
            "items": [{"menu_item_id": str(other["pasta"].id), "quantity": 1}],
        },
        headers=headers["sara"],
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "ITEM_NOT_IN_MENU"


def test_second_submission_is_rejected(client, db, admin_headers, menu):
    sid, headers = setup(client, db, admin_headers, menu)
    payload = {"session_id": sid, "items": [burger_line(menu)]}
    assert client.post(f"{API}/orders", json=payload, headers=headers["sara"]).status_code == 201
    second = client.post(f"{API}/orders", json=payload, headers=headers["sara"])
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "ORDER_EXISTS"
    assert second.json()["error"]["details"]["order_id"]


def test_idempotent_retry_returns_same_order(client, db, admin_headers, menu):
    sid, headers = setup(client, db, admin_headers, menu)
    payload = {"session_id": sid, "items": [burger_line(menu)]}
    h = {**headers["sara"], "Idempotency-Key": "retry-key-123"}
    first = client.post(f"{API}/orders", json=payload, headers=h)
    retry = client.post(f"{API}/orders", json=payload, headers=h)
    assert first.status_code == retry.status_code == 201
    assert first.json()["id"] == retry.json()["id"]
    misuse = client.post(f"{API}/orders", json={**payload, "items": [burger_line(menu, 2)]}, headers=h)
    assert misuse.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"


def test_price_changed_during_checkout(client, db, admin_headers, menu):
    sid, headers = setup(client, db, admin_headers, menu)
    response = client.post(
        f"{API}/orders",
        json={"session_id": sid, "items": [burger_line(menu)], "expected_total": "170.00"},
        headers=headers["sara"],
    )
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "PRICE_CHANGED"
    assert error["details"]["actual_total"] == "180.00"
    ok = client.post(
        f"{API}/orders",
        json={"session_id": sid, "items": [burger_line(menu)], "expected_total": "180.00"},
        headers=headers["sara"],
    )
    assert ok.status_code == 201


def test_unavailable_item_rejected(client, db, admin_headers, menu):
    sid, headers = setup(client, db, admin_headers, menu)
    response = client.post(
        f"{API}/orders",
        json={"session_id": sid, "items": [{"menu_item_id": str(menu["juice"].id), "quantity": 1}]},
        headers=headers["sara"],
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ITEM_UNAVAILABLE"


def test_deadline_is_enforced_by_server(client, db, admin_headers, menu, clock):
    sid, headers = setup(client, db, admin_headers, menu)
    clock.set(TEST_NOW + timedelta(hours=2, minutes=1))  # 12:01 Cairo
    response = client.post(
        f"{API}/orders", json={"session_id": sid, "items": [burger_line(menu)]}, headers=headers["sara"]
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "DEADLINE_PASSED"


def test_closed_session_rejects_orders(client, db, admin_headers, menu):
    sid, headers = setup(client, db, admin_headers, menu)
    client.post(f"{API}/sessions/{sid}/close", headers=admin_headers)
    response = client.post(
        f"{API}/orders", json={"session_id": sid, "items": [burger_line(menu)]}, headers=headers["sara"]
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "SESSION_CLOSED"


def test_edit_order_before_deadline_creates_revision(client, db, admin_headers, menu):
    sid, headers = setup(client, db, admin_headers, menu)
    order = client.post(
        f"{API}/orders", json={"session_id": sid, "items": [burger_line(menu)]}, headers=headers["sara"]
    ).json()
    edited = client.put(
        f"{API}/orders/{order['id']}", json={"items": [burger_line(menu, 3)]}, headers=headers["sara"]
    )
    assert edited.status_code == 200
    assert edited.json()["total_amount"] == "540.00"
    assert edited.json()["revision"] == 2
    assert edited.json()["id"] == order["id"]
    revisions = client.get(f"{API}/admin/orders/{order['id']}/revisions", headers=admin_headers).json()
    assert [r["action"] for r in revisions] == ["CREATED", "UPDATED"]


def test_edit_after_close_rejected(client, db, admin_headers, menu):
    sid, headers = setup(client, db, admin_headers, menu)
    order = client.post(
        f"{API}/orders", json={"session_id": sid, "items": [burger_line(menu)]}, headers=headers["sara"]
    ).json()
    client.post(f"{API}/sessions/{sid}/close", headers=admin_headers)
    response = client.put(
        f"{API}/orders/{order['id']}", json={"items": [burger_line(menu, 2)]}, headers=headers["sara"]
    )
    assert response.json()["error"]["code"] == "SESSION_CLOSED"


def test_employee_cannot_read_or_edit_others_orders(client, db, admin_headers, menu):
    sid, headers = setup(client, db, admin_headers, menu, users=("sara", "omar"))
    order = client.post(
        f"{API}/orders", json={"session_id": sid, "items": [burger_line(menu)]}, headers=headers["sara"]
    ).json()
    assert client.get(f"{API}/orders/me/{order['id']}", headers=headers["omar"]).status_code == 404
    assert (
        client.put(
            f"{API}/orders/{order['id']}", json={"items": [burger_line(menu, 5)]}, headers=headers["omar"]
        ).status_code
        == 404
    )
    assert client.delete(f"{API}/orders/{order['id']}", headers=headers["omar"]).status_code == 404
    assert client.get(f"{API}/admin/orders/{order['id']}", headers=headers["omar"]).status_code == 403


def test_employee_cancel_respects_setting(client, db, admin_headers, menu):
    sid, headers = setup(client, db, admin_headers, menu)
    order = client.post(
        f"{API}/orders", json={"session_id": sid, "items": [burger_line(menu)]}, headers=headers["sara"]
    ).json()
    client.patch(f"{API}/admin/settings", json={"allow_employee_cancellation": False}, headers=admin_headers)
    denied = client.delete(f"{API}/orders/{order['id']}", headers=headers["sara"])
    assert denied.json()["error"]["code"] == "CANCELLATION_NOT_ALLOWED"
    client.patch(f"{API}/admin/settings", json={"allow_employee_cancellation": True}, headers=admin_headers)
    cancelled = client.delete(f"{API}/orders/{order['id']}", headers=headers["sara"])
    assert cancelled.json()["status"] == "CANCELLED"
    # After cancelling, the employee can submit a fresh order.
    again = client.post(
        f"{API}/orders", json={"session_id": sid, "items": [burger_line(menu)]}, headers=headers["sara"]
    )
    assert again.status_code == 201


def test_admin_modify_and_cancel_are_audited(client, db, admin_headers, menu):
    sid, headers = setup(client, db, admin_headers, menu)
    order = client.post(
        f"{API}/orders", json={"session_id": sid, "items": [burger_line(menu)]}, headers=headers["sara"]
    ).json()
    client.post(f"{API}/sessions/{sid}/close", headers=admin_headers)
    missing_reason = client.patch(
        f"{API}/admin/orders/{order['id']}", json={"items": [burger_line(menu, 2)]}, headers=admin_headers
    )
    assert missing_reason.status_code == 422
    modified = client.patch(
        f"{API}/admin/orders/{order['id']}",
        json={"items": [burger_line(menu, 2)], "reason": "Sara called to add one more"},
        headers=admin_headers,
    )
    assert modified.json()["total_amount"] == "360.00"
    cancelled = client.post(
        f"{API}/admin/orders/{order['id']}/cancel", json={"reason": "Left early"}, headers=admin_headers
    )
    assert cancelled.json()["status"] == "CANCELLED"
    logs = client.get(
        f"{API}/admin/audit-logs", params={"entity_type": "order"}, headers=admin_headers
    ).json()
    actions = {entry["action"] for entry in logs["items"]}
    assert {"ORDER_ADMIN_MODIFIED", "ORDER_ADMIN_CANCELLED"} <= actions
    notes = client.get(f"{API}/notifications", headers=headers["sara"]).json()["items"]
    assert any(n["type"] == "ORDER_CANCELLED" for n in notes)


def test_admin_records_order_for_employee(client, db, admin_headers, menu):
    sid, _ = setup(client, db, admin_headers, menu, users=("sara",))
    employee = make_user(db, "late.person")
    response = client.post(
        f"{API}/admin/sessions/{sid}/orders",
        json={"employee_id": str(employee.id), "items": [burger_line(menu)], "reason": "Ordered by phone"},
        headers=admin_headers,
    )
    assert response.status_code == 201
    assert response.json()["employee"]["full_name"] == "Late Person"


def test_history_lists_past_orders(client, db, admin_headers, menu):
    sid, headers = setup(client, db, admin_headers, menu)
    client.post(
        f"{API}/orders", json={"session_id": sid, "items": [burger_line(menu)]}, headers=headers["sara"]
    )
    history = client.get(f"{API}/orders/me/history", headers=headers["sara"]).json()
    assert history["total"] == 1
    assert history["items"][0]["restaurant_name"] == "Restaurant A"
    assert history["items"][0]["item_names"] == ["1× Chicken Burger"]
