"""Menu import lifecycle: upload → extract (background) → review → approve/reject.

An import never touches the published menu until the admin explicitly approves
it, choosing to *replace* (old items archived) or *merge* (matching items
updated, new ones added). Every import and its result is kept as history.
"""

import hashlib
import uuid
from datetime import datetime
from decimal import Decimal

import structlog
from rapidfuzz import fuzz
from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.core.clock import Clock
from app.core.errors import BusinessRuleError, ConflictError, NotFoundError
from app.models import MenuCategory, MenuImport, MenuItem, Modifier, ModifierGroup, User
from app.models.enums import ImportSourceType, ImportStatus, RestaurantSource
from app.schemas.menu_import import DraftItem, ImportDraft
from app.services import audit_service, restaurant_service, upload_service
from app.services.menu_import import scoring
from app.services.menu_import.detect import detect_source_type
from app.services.menu_import.extractors.image import extract_image
from app.services.menu_import.extractors.pdf import extract_pdf
from app.services.menu_import.extractors.tabular import extract_tabular
from app.services.menu_import.types import ExtractionError, ExtractionOutput
from app.utils.text import normalize_name

log = structlog.get_logger(__name__)

SIZE_GROUP = "Size"
EXTRAS_GROUP = "Extras"
MERGE_THRESHOLD = 92


def extract(data: bytes, source_type: str) -> ExtractionOutput:
    if source_type == ImportSourceType.PDF:
        return extract_pdf(data)
    if source_type == ImportSourceType.IMAGE:
        return extract_image(data)
    return extract_tabular(data, source_type)


def create_import(
    db: Session, actor: User, restaurant_id: uuid.UUID, data: bytes, filename: str, force: bool
) -> MenuImport:
    restaurant_service.get_restaurant(db, restaurant_id)
    try:
        source_type, extension = detect_source_type(data, filename)
    except ExtractionError as exc:
        raise BusinessRuleError(exc.message, code=exc.code) from exc
    digest = hashlib.sha256(data).hexdigest()
    duplicate = db.scalar(
        select(MenuImport).where(
            MenuImport.restaurant_id == restaurant_id,
            MenuImport.file_sha256 == digest,
            MenuImport.status.not_in([ImportStatus.REJECTED, ImportStatus.FAILED]),
        )
    )
    if duplicate is not None and not force:
        raise ConflictError(
            "This exact file was already imported for this restaurant.",
            code="DUPLICATE_IMPORT",
            details={"import_id": str(duplicate.id), "status": duplicate.status},
        )
    stored = upload_service.store_private(data, f"imports/{restaurant_id}", extension)
    record = MenuImport(
        restaurant_id=restaurant_id,
        source_type=source_type,
        original_filename=(filename or f"menu.{extension}")[:255],
        stored_path=stored,
        file_sha256=digest,
        file_size=len(data),
        status=ImportStatus.PROCESSING,
        uploaded_by_id=actor.id,
    )
    db.add(record)
    db.flush()
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="menu_import",
        entity_id=record.id,
        action="MENU_IMPORT_UPLOADED",
        new={"restaurant_id": restaurant_id, "filename": record.original_filename, "type": source_type},
    )
    db.commit()
    return record


def process_import(import_id: uuid.UUID, session_factory=None) -> None:
    """Run extraction for an uploaded file. Executed as a background task."""
    if session_factory is None:
        from app.db.session import SessionLocal

        session_factory = SessionLocal
    db: Session = session_factory()
    try:
        record = db.get(MenuImport, import_id)
        if record is None or record.status != ImportStatus.PROCESSING:
            return
        try:
            data = upload_service.read_private(record.stored_path)
            output = extract(data, record.source_type)
            drafts = scoring.to_draft(output.items)
            draft = ImportDraft(
                items=drafts,
                categories=list(dict.fromkeys(d.category for d in drafts)),
                meta={**output.meta, "unparsed_lines": output.unparsed_lines[:200]},
            )
            record.extraction_result = draft.model_dump(mode="json")
            record.warnings = output.warnings
            record.stats = scoring.summarize(drafts)
            if drafts:
                record.status = ImportStatus.NEEDS_REVIEW
            else:
                record.status = ImportStatus.FAILED
                record.error_message = (
                    "No menu items with names and prices could be recognized. "
                    "Check the file, or add the items manually."
                )
        except ExtractionError as exc:
            record.status = ImportStatus.FAILED
            record.error_message = exc.message
            record.warnings = [*(record.warnings or []), {"code": exc.code, "message": exc.message}]
        except Exception as exc:
            log.exception("menu_import_failed", import_id=str(import_id))
            record.status = ImportStatus.FAILED
            record.error_message = f"Extraction failed unexpectedly: {str(exc)[:200]}"
        db.commit()
    finally:
        db.close()


def get_import(
    db: Session, restaurant_id: uuid.UUID, import_id: uuid.UUID, *, lock: bool = False
) -> MenuImport:
    stmt = select(MenuImport).where(MenuImport.id == import_id)
    if lock:
        stmt = stmt.with_for_update()
    record = db.scalar(stmt)
    if record is None or record.restaurant_id != restaurant_id:
        raise NotFoundError("Menu import not found.", code="IMPORT_NOT_FOUND")
    return record


def list_imports(db: Session, restaurant_id: uuid.UUID) -> list[MenuImport]:
    restaurant_service.get_restaurant(db, restaurant_id)
    return list(
        db.scalars(
            select(MenuImport)
            .where(MenuImport.restaurant_id == restaurant_id)
            .order_by(MenuImport.created_at.desc())
        )
    )


def update_draft(
    db: Session, actor: User, restaurant_id: uuid.UUID, import_id: uuid.UUID, items: list[DraftItem]
):
    record = get_import(db, restaurant_id, import_id, lock=True)
    if record.status != ImportStatus.NEEDS_REVIEW:
        raise ConflictError("Only imports awaiting review can be edited.", code="IMPORT_NOT_EDITABLE")
    current = ImportDraft.model_validate(record.extraction_result or {})
    evaluated = [scoring.evaluate(item) for item in items]
    draft = ImportDraft(
        items=evaluated,
        categories=list(dict.fromkeys(i.category for i in evaluated)),
        meta=current.meta,
    )
    record.extraction_result = draft.model_dump(mode="json")
    record.stats = scoring.summarize(evaluated)
    record.reviewed_by = actor.id
    db.commit()
    db.refresh(record)
    return record


def reject_import(db: Session, actor: User, restaurant_id: uuid.UUID, import_id: uuid.UUID) -> MenuImport:
    record = get_import(db, restaurant_id, import_id, lock=True)
    if record.status not in (ImportStatus.NEEDS_REVIEW, ImportStatus.FAILED):
        raise ConflictError("This import can no longer be rejected.", code="IMPORT_NOT_EDITABLE")
    record.status = ImportStatus.REJECTED
    record.reviewed_by = actor.id
    audit_service.record(
        db, actor_id=actor.id, entity_type="menu_import", entity_id=record.id, action="MENU_IMPORT_REJECTED"
    )
    db.commit()
    db.refresh(record)
    return record


def _validate_for_publish(items: list[DraftItem]) -> None:
    problems = []
    for item in items:
        issues = []
        if not item.name or len(item.name.strip()) < 2:
            issues.append("Name is required.")
        if item.base_price is None:
            issues.append("Base price is required.")
        if any(o.price is None for o in item.sizes + item.extras):
            issues.append("Every size and extra needs a price (use 0 for free).")
        if not item.category.strip():
            issues.append("Category is required.")
        if issues:
            problems.append({"id": item.id, "name": item.name, "problems": issues})
    if problems:
        raise BusinessRuleError(
            f"{len(problems)} item(s) still need fixing before the menu can be published.",
            code="IMPORT_HAS_ERRORS",
            details={"items": problems[:100]},
        )


def _replace_groups(item: MenuItem, draft: DraftItem) -> None:
    if draft.sizes:
        item.modifier_groups[:] = [g for g in item.modifier_groups if g.name != SIZE_GROUP]
    if draft.extras:
        item.modifier_groups[:] = [g for g in item.modifier_groups if g.name != EXTRAS_GROUP]
    order = len(item.modifier_groups)
    if draft.sizes:
        group = ModifierGroup(
            name=SIZE_GROUP, minimum_selections=1, maximum_selections=1, is_required=True, display_order=order
        )
        for idx, option in enumerate(draft.sizes):
            group.modifiers.append(
                Modifier(name=option.name, additional_price=option.price or Decimal("0"), display_order=idx)
            )
        item.modifier_groups.append(group)
        order += 1
    if draft.extras:
        group = ModifierGroup(
            name=EXTRAS_GROUP,
            minimum_selections=0,
            maximum_selections=len(draft.extras),
            is_required=False,
            display_order=order,
        )
        for idx, option in enumerate(draft.extras):
            group.modifiers.append(
                Modifier(name=option.name, additional_price=option.price or Decimal("0"), display_order=idx)
            )
        item.modifier_groups.append(group)


def approve_import(
    db: Session,
    actor: User,
    restaurant_id: uuid.UUID,
    import_id: uuid.UUID,
    mode: str,
    confirm_replace: bool,
    clock: Clock,
) -> MenuImport:
    record = get_import(db, restaurant_id, import_id, lock=True)
    if record.status != ImportStatus.NEEDS_REVIEW:
        raise ConflictError("This import is not awaiting review.", code="IMPORT_NOT_EDITABLE")
    draft = ImportDraft.model_validate(record.extraction_result or {})
    items = draft.items
    if not items:
        raise BusinessRuleError("The import has no items to publish.", code="IMPORT_EMPTY")
    _validate_for_publish(items)

    restaurant = restaurant_service.get_restaurant(db, restaurant_id)
    existing_count = restaurant_service.menu_item_count(db, restaurant_id)
    if mode == "replace" and existing_count and not confirm_replace:
        raise ConflictError(
            f"This restaurant already has {existing_count} published item(s). "
            "Confirm that the import should replace the current menu.",
            code="CONFIRM_REPLACE_REQUIRED",
            details={"existing_items": existing_count},
        )

    now: datetime = clock.now()
    archived = 0
    if mode == "replace" and existing_count:
        archived = existing_count
        db.execute(
            update(MenuItem)
            .where(MenuItem.restaurant_id == restaurant_id, MenuItem.is_archived.is_(False))
            .values(is_archived=True)
        )
        db.execute(
            update(MenuCategory)
            .where(MenuCategory.restaurant_id == restaurant_id, MenuCategory.is_archived.is_(False))
            .values(is_archived=True)
        )
        db.flush()

    categories = {
        c.name.strip().lower(): c
        for c in db.scalars(
            select(MenuCategory).where(
                MenuCategory.restaurant_id == restaurant_id, MenuCategory.is_archived.is_(False)
            )
        )
    }
    existing_items = (
        list(
            db.scalars(
                select(MenuItem)
                .where(MenuItem.restaurant_id == restaurant_id, MenuItem.is_archived.is_(False))
                .options(selectinload(MenuItem.modifier_groups).selectinload(ModifierGroup.modifiers))
            )
        )
        if mode == "merge"
        else []
    )
    next_category_order = max((c.display_order for c in categories.values()), default=0) + 1

    created = updated = 0
    for position, draft_item in enumerate(items):
        key = draft_item.category.strip().lower()
        category = categories.get(key)
        if category is None:
            category = MenuCategory(
                restaurant_id=restaurant_id,
                name=draft_item.category.strip(),
                display_order=next_category_order,
            )
            next_category_order += 1
            db.add(category)
            db.flush()
            categories[key] = category

        match: MenuItem | None = None
        if mode == "merge":
            target = normalize_name(draft_item.name)
            best_score = 0.0
            for candidate in existing_items:
                score = fuzz.token_sort_ratio(target, normalize_name(candidate.name))
                if candidate.category_id == category.id:
                    score += 2
                if score >= MERGE_THRESHOLD and score > best_score:
                    match, best_score = candidate, score

        if match is not None:
            match.base_price = draft_item.base_price
            match.category_id = category.id
            match.is_available = draft_item.is_available
            if draft_item.description:
                match.description = draft_item.description
            _replace_groups(match, draft_item)
            existing_items.remove(match)
            updated += 1
        else:
            item = MenuItem(
                restaurant_id=restaurant_id,
                category_id=category.id,
                name=draft_item.name.strip(),
                description=draft_item.description,
                base_price=draft_item.base_price,
                is_available=draft_item.is_available,
                display_order=position,
            )
            _replace_groups(item, draft_item)
            db.add(item)
            created += 1

    if restaurant.source_provider == RestaurantSource.MANUAL:
        restaurant.source_provider = RestaurantSource.FILE_IMPORT
    restaurant.last_synced_at = now
    record.status = ImportStatus.APPROVED
    record.approved_at = now
    record.approval_mode = mode
    record.reviewed_by = actor.id
    record.stats = {**(record.stats or {}), "created": created, "updated": updated, "archived": archived}
    audit_service.record(
        db,
        actor_id=actor.id,
        entity_type="menu_import",
        entity_id=record.id,
        action="MENU_IMPORT_APPROVED",
        new={"mode": mode, "created": created, "updated": updated, "archived": archived},
    )
    db.commit()
    db.refresh(record)
    return record
