"""Push delivery through the Expo Push Service (HTTP mocked)."""

from sqlalchemy import select

from app.core.config import get_settings
from app.models import Notification, PushTicket, PushToken
from app.models.enums import NotificationType
from app.services import notification_service, push_service
from tests.conftest import make_user


class FakeResponse:
    def __init__(self, tickets):
        self._tickets = tickets

    def raise_for_status(self):
        return None

    def json(self):
        return {"data": self._tickets}


def install_fake_expo(monkeypatch, tickets):
    sent: list[dict] = []

    class FakeClient:
        def __init__(self, timeout):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def post(self, url, json, headers):
            sent.extend(json)
            return FakeResponse(tickets[: len(json)])

    enabled = get_settings().model_copy(update={"push_enabled": True})
    monkeypatch.setattr(push_service, "get_settings", lambda: enabled)
    monkeypatch.setattr(push_service.httpx, "Client", FakeClient)
    return sent


def test_push_sent_to_all_devices_and_dead_tokens_deactivated(db, monkeypatch):
    user = make_user(db, "sara")
    db.add_all(
        [
            PushToken(user_id=user.id, token="ExponentPushToken[phone]", platform="ios"),
            PushToken(user_id=user.id, token="ExponentPushToken[old-tablet]", platform="android"),
        ]
    )
    db.commit()
    ids = notification_service.notify(
        db, [user.id], type=NotificationType.ORDER_SUBMITTED, title="Order submitted", message="Thanks"
    )
    db.commit()
    sent = install_fake_expo(
        monkeypatch,
        [
            {"status": "ok", "id": "ticket-1"},
            {"status": "error", "details": {"error": "DeviceNotRegistered"}},
        ],
    )

    push_service.dispatch(ids)

    assert {m["to"] for m in sent} == {"ExponentPushToken[phone]", "ExponentPushToken[old-tablet]"}
    assert sent[0]["title"] == "Order submitted"
    db.expire_all()
    assert db.get(Notification, ids[0]).push_status == "SENT"
    tokens = {t.token: t.is_active for t in db.scalars(select(PushToken))}
    assert tokens == {"ExponentPushToken[phone]": True, "ExponentPushToken[old-tablet]": False}
    assert db.scalar(select(PushTicket.ticket_id)) == "ticket-1"


def test_push_respects_preferences_and_missing_devices(db, monkeypatch):
    opted_out = make_user(db, "omar", notification_prefs={"deadline_reminders": False})
    no_device = make_user(db, "mona")
    db.add(PushToken(user_id=opted_out.id, token="ExponentPushToken[omar]", platform="ios"))
    db.commit()
    ids = notification_service.notify(
        db,
        [opted_out.id, no_device.id],
        type=NotificationType.DEADLINE_APPROACHING,
        title="30 minutes left",
        message="Order now",
    )
    db.commit()
    sent = install_fake_expo(monkeypatch, [])

    push_service.dispatch(ids)

    assert sent == []
    db.expire_all()
    statuses = {n.user_id: n.push_status for n in db.scalars(select(Notification))}
    assert statuses == {opted_out.id: "OPTED_OUT", no_device.id: "NO_DEVICE"}
