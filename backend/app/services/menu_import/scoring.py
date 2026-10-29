"""Confidence scores, validation status and duplicate hints for extracted items."""

import uuid
from decimal import Decimal
from statistics import median

from rapidfuzz import fuzz

from app.schemas.menu_import import DraftItem, DraftOption
from app.services.menu_import.types import ExtractedItem
from app.utils.text import normalize_name

REVIEW_ISSUES = {
    "MISSING_PRICE",
    "INVALID_PRICE",
    "UNLABELED_SIZES",
    "PRICE_OUTLIER",
    "LOW_OCR_CONFIDENCE",
    "POSSIBLE_DUPLICATE",
    "MISSING_OPTION_PRICE",
}
INVALID_ISSUES = {"MISSING_NAME"}
DUPLICATE_THRESHOLD = 90


def evaluate(item: DraftItem, price_median: Decimal | None = None) -> DraftItem:
    """Recompute issues/status for a draft item (also used after admin edits)."""
    issues = [i for i in item.issues if i in {"UNLABELED_SIZES", "LOW_OCR_CONFIDENCE", "POSSIBLE_DUPLICATE"}]
    if not item.name or len(item.name.strip()) < 2:
        issues.append("MISSING_NAME")
    if item.base_price is None:
        issues.append("MISSING_PRICE")
    elif (
        price_median
        and price_median > 0
        and (
            item.base_price > price_median * 8
            or (item.base_price < price_median / 15 and item.base_price < 5)
        )
    ):
        issues.append("PRICE_OUTLIER")
    if any(o.price is None for o in item.sizes + item.extras):
        issues.append("MISSING_OPTION_PRICE")
    item.issues = sorted(set(issues))
    if set(item.issues) & INVALID_ISSUES:
        item.status = "INVALID"
    elif set(item.issues) & REVIEW_ISSUES or item.confidence < 0.7:
        item.status = "NEEDS_REVIEW"
    else:
        item.status = "VALID"
    return item


def to_draft(items: list[ExtractedItem]) -> list[DraftItem]:
    drafts: list[DraftItem] = []
    for extracted in items:
        confidence = max(0.0, min(1.0, extracted.confidence))
        issues = list(extracted.issues)
        if extracted.source.get("ocr") and confidence < 0.6:
            issues.append("LOW_OCR_CONFIDENCE")
        if extracted.base_price is None:
            confidence *= 0.5
        if "UNLABELED_SIZES" in issues:
            confidence *= 0.85
        drafts.append(
            DraftItem(
                id=uuid.uuid4().hex[:12],
                category=extracted.category or "Menu",
                name=extracted.name,
                description=extracted.description,
                base_price=extracted.base_price,
                sizes=[DraftOption(name=o.name, price=o.price) for o in extracted.sizes],
                extras=[DraftOption(name=o.name, price=o.price) for o in extracted.extras],
                is_available=extracted.is_available,
                confidence=round(confidence, 2),
                issues=issues,
                source=extracted.source or None,
            )
        )

    # Duplicate hints within the same category.
    seen: list[DraftItem] = []
    for draft in drafts:
        key = normalize_name(draft.name)
        for other in seen:
            if (
                other.category.lower() == draft.category.lower()
                and key
                and (fuzz.token_sort_ratio(key, normalize_name(other.name)) >= DUPLICATE_THRESHOLD)
            ):
                draft.duplicate_of = other.id
                draft.issues.append("POSSIBLE_DUPLICATE")
                draft.confidence = round(draft.confidence * 0.9, 2)
                break
        seen.append(draft)

    prices = [d.base_price for d in drafts if d.base_price is not None]
    price_median = Decimal(median(prices)) if prices else None
    return [evaluate(d, price_median) for d in drafts]


def summarize(drafts: list[DraftItem]) -> dict:
    return {
        "items": len(drafts),
        "valid": sum(1 for d in drafts if d.status == "VALID"),
        "needs_review": sum(1 for d in drafts if d.status == "NEEDS_REVIEW"),
        "invalid": sum(1 for d in drafts if d.status == "INVALID"),
        "categories": len({d.category for d in drafts}),
        "average_confidence": round(sum(d.confidence for d in drafts) / len(drafts), 2) if drafts else 0,
    }
