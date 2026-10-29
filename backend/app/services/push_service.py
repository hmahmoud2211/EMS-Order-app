"""Expo push delivery (free Expo Push Service).

Notifications created during a transaction are recorded in ``Session.info``; an
``after_commit`` hook hands their ids to a small thread pool which sends pushes
using its own database session. Failures are logged and recorded on the
notification row, never raised into the request that created them.
"""

import uuid
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import httpx
import structlog
from sqlalchemy import event, select, update
from sqlalchemy.orm import Session

from app.core.clock import get_clock
from app.core.config import get_settings
from app.models import Notification, PushTicket, PushToken, User
from app.services.notification_service import PENDING_PUSH_KEY, PREF_FOR_TYPE

log = structlog.get_logger(__name__)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="push")
_CHUNK = 100


def _session_factory():
    from app.db.session import SessionLocal

    return SessionLocal()


def _headers() -> dict[str, str]:
    settings = get_settings()
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if settings.expo_access_token:
        headers["Authorization"] = f"Bearer {settings.expo_access_token}"
    return headers


def dispatch(notification_ids: Sequence[uuid.UUID]) -> None:
    """Send pushes for the given notifications. Safe to call from any thread."""
    settings = get_settings()
    if not notification_ids:
        return
    db = _session_factory()
    try:
        notifications = list(db.scalars(select(Notification).where(Notification.id.in_(notification_ids))))
        if not settings.push_enabled:
            db.execute(
                update(Notification)
                .where(Notification.id.in_(notification_ids))
                .values(push_status="DISABLED")
            )
            db.commit()
            return

        user_ids = {n.user_id for n in notifications}
        users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(user_ids)))}
        tokens_by_user: dict[uuid.UUID, list[PushToken]] = {}
        for token in db.scalars(
            select(PushToken).where(PushToken.user_id.in_(user_ids), PushToken.is_active.is_(True))
        ):
            tokens_by_user.setdefault(token.user_id, []).append(token)

        messages: list[tuple[Notification, PushToken, dict]] = []
        for n in notifications:
            user = users.get(n.user_id)
            pref = PREF_FOR_TYPE.get(n.type)
            if user is None or not user.is_active:
                n.push_status = "SKIPPED"
                continue
            if pref and not (user.notification_prefs or {}).get(pref, True):
                n.push_status = "OPTED_OUT"
                continue
            user_tokens = tokens_by_user.get(n.user_id, [])
            if not user_tokens:
                n.push_status = "NO_DEVICE"
                continue
            for token in user_tokens:
                messages.append(
                    (
                        n,
                        token,
                        {
                            "to": token.token,
                            "title": n.title,
                            "body": n.message,
                            "sound": "default",
                            "data": {**(n.data or {}), "notificationId": str(n.id), "type": n.type},
                            "channelId": "default",
                        },
                    )
                )
        db.commit()
        if messages:
            _send(db, messages)
    except Exception as exc:  # never propagate push failures
        log.exception("push_dispatch_failed", error=str(exc))
        db.rollback()
    finally:
        db.close()


def _send(db: Session, messages: list[tuple[Notification, PushToken, dict]]) -> None:
    settings = get_settings()
    with httpx.Client(timeout=10) as client:
        for start in range(0, len(messages), _CHUNK):
            chunk = messages[start : start + _CHUNK]
            try:
                response = client.post(settings.expo_push_url, json=[m[2] for m in chunk], headers=_headers())
                response.raise_for_status()
                tickets = response.json().get("data", [])
            except Exception as exc:
                log.warning("push_send_failed", error=str(exc), count=len(chunk))
                for notification, _, _ in chunk:
                    if notification.push_status != "SENT":
                        notification.push_status = "FAILED"
                db.commit()
                continue
            for (notification, token, _), ticket in zip(chunk, tickets, strict=False):
                if ticket.get("status") == "ok":
                    notification.push_status = "SENT"
                    if ticket.get("id"):
                        db.add(
                            PushTicket(
                                ticket_id=ticket["id"],
                                push_token_id=token.id,
                                notification_id=notification.id,
                            )
                        )
                else:
                    # A user may have several devices: one success is enough to count as SENT.
                    if notification.push_status != "SENT":
                        notification.push_status = "FAILED"
                    error = (ticket.get("details") or {}).get("error")
                    log.warning("push_ticket_error", error=error, message=ticket.get("message"))
                    if error == "DeviceNotRegistered":
                        token.is_active = False
            db.commit()


def check_receipts(db: Session) -> int:
    """Check Expo receipts for tickets older than 15 minutes; deactivate dead tokens."""
    settings = get_settings()
    cutoff = get_clock().now() - timedelta(minutes=15)
    tickets = list(
        db.scalars(
            select(PushTicket)
            .where(PushTicket.checked_at.is_(None), PushTicket.created_at < cutoff)
            .limit(300)
        )
    )
    if not tickets or not settings.push_enabled:
        return 0
    try:
        with httpx.Client(timeout=10) as client:
            response = client.post(
                settings.expo_receipts_url, json={"ids": [t.ticket_id for t in tickets]}, headers=_headers()
            )
            response.raise_for_status()
            receipts = response.json().get("data", {})
    except Exception as exc:
        log.warning("push_receipts_failed", error=str(exc))
        return 0
    now = get_clock().now()
    for ticket in tickets:
        receipt = receipts.get(ticket.ticket_id)
        ticket.checked_at = now
        if not receipt:
            continue
        ticket.receipt_status = receipt.get("status")
        if receipt.get("status") == "error":
            error = (receipt.get("details") or {}).get("error")
            log.warning("push_receipt_error", error=error)
            if error == "DeviceNotRegistered":
                db.execute(
                    update(PushToken).where(PushToken.id == ticket.push_token_id).values(is_active=False)
                )
    db.commit()
    return len(tickets)


def install_after_commit_hook(session_class: type[Session] | object) -> None:
    @event.listens_for(session_class, "after_commit")
    def _after_commit(session: Session) -> None:
        pending = session.info.pop(PENDING_PUSH_KEY, None)
        if pending:
            _executor.submit(dispatch, list(pending))

    @event.listens_for(session_class, "after_rollback")
    def _after_rollback(session: Session) -> None:
        session.info.pop(PENDING_PUSH_KEY, None)
