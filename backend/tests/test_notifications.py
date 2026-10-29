from datetime import timedelta

from sqlalchemy import select

from app.core.clock import get_clock
from app.models import DailySession, Notification
from app.workers import jobs
from tests.conftest import TEST_NOW, login, make_user, open_session

API = "/api/v1"


def test_opening_session_notifies_participants_once(client, db, admin_headers, menu):
    make_user(db, "sara")
    session = open_session(client, admin_headers, menu["restaurant"].id)
    headers = login(client, "sara")
    notes = client.get(f"{API}/notifications", headers=headers).json()
    assert notes["unread"] == 1
    assert notes["items"][0]["type"] == "ORDERING_OPENED"
    assert "Restaurant A" in notes["items"][0]["message"]
    # Re-running the opened notification (e.g. worker after a restart) does not duplicate it.
    jobs.notify_ordering_opened(db, get_clock())
    stored = db.scalar(select(DailySession).where(DailySession.id == session["id"]))
    from app.services.session_service import notify_opened

    notify_opened(db, stored, get_clock())
    db.commit()
    assert client.get(f"{API}/notifications", headers=headers).json()["total"] == 1


def test_mark_read_and_ownership(client, db, admin_headers, menu):
    make_user(db, "sara")
    make_user(db, "omar")
    open_session(client, admin_headers, menu["restaurant"].id)
    sara, omar = login(client, "sara"), login(client, "omar")
    note_id = client.get(f"{API}/notifications", headers=sara).json()["items"][0]["id"]
    assert client.patch(f"{API}/notifications/{note_id}/read", headers=omar).status_code == 404
    assert client.patch(f"{API}/notifications/{note_id}/read", headers=sara).json()["is_read"] is True
    client.patch(f"{API}/notifications/read-all", headers=omar)
    assert client.get(f"{API}/notifications", headers=omar).json()["unread"] == 0


def test_deadline_reminder_targets_only_people_without_orders(client, db, admin_headers, menu, clock):
    make_user(db, "sara")
    make_user(db, "omar")
    sid = open_session(client, admin_headers, menu["restaurant"].id)["id"]
    client.post(
        f"{API}/orders",
        json={"session_id": sid, "items": [{"menu_item_id": str(menu["pasta"].id), "quantity": 1}]},
        headers=login(client, "sara"),
    )
    clock.set(TEST_NOW + timedelta(hours=1, minutes=40))  # 11:40, deadline 12:00
    assert jobs.deadline_reminders(db, clock) == 1
    assert jobs.deadline_reminders(db, clock) == 0  # de-duplicated
    reminders = db.scalars(select(Notification).where(Notification.type == "DEADLINE_APPROACHING")).all()
    assert len(reminders) == 1
    assert "20 minutes" in reminders[0].title


def test_auto_close_after_deadline(client, db, admin_headers, menu, clock):
    make_user(db, "sara")
    sid = open_session(client, admin_headers, menu["restaurant"].id)["id"]
    clock.set(TEST_NOW + timedelta(hours=2))
    assert jobs.auto_close_sessions(db, clock) == 1
    db.expire_all()
    assert db.get(DailySession, sid).status == "CLOSED"
    notes = client.get(f"{API}/notifications", headers=login(client, "sara")).json()["items"]
    assert {n["type"] for n in notes} == {"ORDERING_OPENED", "SESSION_CLOSED"}


def test_register_device_and_preferences(client, db):
    make_user(db, "sara")
    headers = login(client, "sara")
    token = "ExponentPushToken[abcdefghijklmnop]"
    assert (
        client.post(
            f"{API}/notifications/register-device",
            json={"token": token, "platform": "ios", "device_name": "iPhone"},
            headers=headers,
        ).status_code
        == 204
    )
    # Registering the same token twice is safe.
    assert (
        client.post(
            f"{API}/notifications/register-device", json={"token": token, "platform": "ios"}, headers=headers
        ).status_code
        == 204
    )
    bad = client.post(
        f"{API}/notifications/register-device",
        json={"token": "not-a-token", "platform": "ios"},
        headers=headers,
    )
    assert bad.status_code == 422
    prefs = client.patch(
        f"{API}/notifications/preferences", json={"deadline_reminders": False}, headers=headers
    ).json()
    assert prefs == {"session_updates": True, "deadline_reminders": False, "order_updates": True}
