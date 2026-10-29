import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog
from app.utils.serialization import to_jsonable


def record(
    db: Session,
    *,
    actor_id: uuid.UUID | None,
    entity_type: str,
    entity_id: uuid.UUID | str,
    action: str,
    previous: dict[str, Any] | None = None,
    new: dict[str, Any] | None = None,
    reason: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_user_id=actor_id,
        entity_type=entity_type,
        entity_id=str(entity_id),
        action=action,
        previous_value=to_jsonable(previous) if previous is not None else None,
        new_value=to_jsonable(new) if new is not None else None,
        reason=reason,
    )
    db.add(entry)
    return entry
