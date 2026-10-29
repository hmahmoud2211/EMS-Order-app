"""CSV and Excel menus.

Columns are matched by fuzzy header synonyms (English and Arabic). Rows that
share a category and name but differ by size are merged into one item with a
Size option group. Formats accepted in cells:

* sizes:  ``Regular:0|Large:+35`` (increments) or ``Regular:180|Large:215`` (absolute prices)
* extras: ``Cheese:20|Sauce:10``
* available: yes/no, true/false, 1/0, نعم/لا
"""

import io
import re
from decimal import Decimal

import pandas as pd
from rapidfuzz import fuzz, process

from app.services.menu_import.parser import CURRENCY, to_price
from app.services.menu_import.types import ExtractedItem, ExtractedOption, ExtractionError, ExtractionOutput
from app.utils.text import normalize_digits

COLUMN_SYNONYMS: dict[str, list[str]] = {
    "category": [
        "category",
        "section",
        "group",
        "menu section",
        "type",
        "القسم",
        "الفئة",
        "التصنيف",
        "النوع",
    ],
    "name": [
        "name",
        "item",
        "item name",
        "product",
        "dish",
        "meal",
        "food",
        "الاسم",
        "الصنف",
        "اسم الصنف",
        "الوجبة",
        "المنتج",
    ],
    "description": ["description", "details", "ingredients", "desc", "الوصف", "المكونات", "التفاصيل"],
    "price": ["price", "base price", "cost", "amount", "egp", "price egp", "السعر", "الثمن"],
    "size": ["size", "sizes", "variant", "الحجم", "المقاس"],
    "extras": ["extras", "add-ons", "addons", "extra", "options", "الإضافات", "اضافات", "إضافات"],
    "available": ["available", "availability", "in stock", "active", "متاح", "متوفر"],
}
_FALSE = {"no", "n", "false", "0", "unavailable", "sold out", "لا", "غير متاح", "غير متوفر"}
_OPTION_SPLIT = re.compile(r"[|;\n]+")
_PAIR = re.compile(
    r"^\s*(.+?)\s*[:=]\s*(\+?)\s*(?:" + CURRENCY + r"\s*)?([\d.,]+)\s*(?:" + CURRENCY + r")?\s*$",
    re.IGNORECASE,
)


def _decode(data: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1256", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ExtractionError("INVALID_CSV", "The CSV encoding is not supported. Save it as UTF-8.")


def _map_columns(headers: list[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    choices = {syn: field for field, syns in COLUMN_SYNONYMS.items() for syn in syns}
    for header in headers:
        key = normalize_digits(str(header)).strip().lower().replace("_", " ")
        if not key or key.startswith("unnamed"):
            continue
        match = process.extractOne(key, list(choices), scorer=fuzz.ratio, score_cutoff=82)
        if match:
            field = choices[match[0]]
            if field not in mapping:
                mapping[field] = header
    return mapping


def _find_header(frame: pd.DataFrame) -> pd.DataFrame | None:
    """Return a frame whose header row has at least a name column (searching the first rows)."""
    if "name" in _map_columns([str(c) for c in frame.columns]):
        return frame
    for idx in range(min(10, len(frame))):
        row = [str(v) for v in frame.iloc[idx].tolist()]
        if "name" in _map_columns(row):
            new = frame.iloc[idx + 1 :].copy()
            new.columns = row
            return new
    return None


def _price(value: object) -> tuple[Decimal | None, bool]:
    """Return (price, had_value)."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None, False
    text = normalize_digits(str(value)).strip()
    if not text or text.lower() in {"nan", "none", "-"}:
        return None, False
    cleaned = re.sub(CURRENCY, "", text, flags=re.IGNORECASE).strip()
    return to_price(cleaned.replace(" ", "")), True


def _options(value: object) -> tuple[list[tuple[str, Decimal | None, bool]], bool]:
    """Parse 'Name:price|Name:+price'. Returns ([(name, price, explicit_increment)], had_bad_values)."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return [], False
    text = normalize_digits(str(value)).strip()
    if not text or text.lower() == "nan":
        return [], False
    options = []
    bad = False
    for part in _OPTION_SPLIT.split(text):
        part = part.strip()
        if not part:
            continue
        match = _PAIR.match(part)
        if match:
            options.append((match.group(1).strip(), to_price(match.group(3)), match.group(2) == "+"))
        else:
            options.append((part, None, False))
            bad = True
    return options, bad


def _available(value: object) -> bool:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return True
    return str(value).strip().lower() not in _FALSE


def _frames(data: bytes, kind: str) -> list[tuple[str | None, pd.DataFrame]]:
    try:
        if kind == "CSV":
            frame = pd.read_csv(io.StringIO(_decode(data)), dtype=str, sep=None, engine="python")
            return [(None, frame)]
        sheets = pd.read_excel(io.BytesIO(data), sheet_name=None, dtype=str, engine="openpyxl")
        return list(sheets.items())
    except ExtractionError:
        raise
    except Exception as exc:
        raise ExtractionError(
            "INVALID_SPREADSHEET", f"The {kind} file could not be read: {str(exc)[:160]}"
        ) from exc


def extract_tabular(data: bytes, kind: str) -> ExtractionOutput:
    frames = _frames(data, kind)
    grouped: dict[tuple[str, str], ExtractedItem] = {}
    size_rows: dict[tuple[str, str], list[tuple[str, Decimal]]] = {}
    warnings: list[dict] = []
    unparsed: list[str] = []
    used_sheets = 0

    for sheet_name, raw in frames:
        frame = _find_header(raw.dropna(how="all"))
        if frame is None:
            if sheet_name:
                warnings.append(
                    {"code": "SHEET_SKIPPED", "message": f"Sheet '{sheet_name}' has no item name column."}
                )
            continue
        used_sheets += 1
        columns = _map_columns([str(c) for c in frame.columns])
        if "price" not in columns:
            warnings.append(
                {
                    "code": "NO_PRICE_COLUMN",
                    "message": "No price column was found; prices must be entered manually.",
                }
            )
        default_category = str(sheet_name).strip() if sheet_name and len(frames) > 1 else "Menu"
        for row_number, (_, row) in enumerate(frame.iterrows(), start=2):

            def cell(field: str, row=row, columns=columns) -> object:
                return row.get(columns[field]) if field in columns else None

            name = str(cell("name") or "").strip()
            if not name or name.lower() == "nan":
                values = [str(v) for v in row.tolist() if str(v).strip() and str(v).lower() != "nan"]
                if values:
                    unparsed.append(" | ".join(values)[:200])
                continue
            category = str(cell("category") or "").strip()
            category = default_category if not category or category.lower() == "nan" else category
            price, had_price = _price(cell("price"))
            size_value = cell("size")
            size_label = (
                str(size_value).strip() if size_value is not None and str(size_value) != "nan" else ""
            )
            key = (category.lower(), name.lower())
            description = cell("description")
            description = (
                str(description).strip() if description is not None and str(description) != "nan" else None
            )

            item = grouped.get(key)
            if item is None:
                item = ExtractedItem(
                    category=category,
                    name=name,
                    description=description or None,
                    is_available=_available(cell("available")),
                    source={"row": row_number, "sheet": sheet_name},
                )
                grouped[key] = item
            if had_price and price is None:
                item.issues.append("INVALID_PRICE")

            # Size variants: either one row per size, or a sizes cell on one row.
            if size_label and ":" not in size_label and "=" not in size_label and price is not None:
                size_rows.setdefault(key, []).append((size_label, price))
            else:
                if price is not None and item.base_price is None:
                    item.base_price = price
                sizes, bad = _options(size_value) if size_label else ([], False)
                if bad:
                    item.issues.append("MISSING_OPTION_PRICE")
                if sizes:
                    explicit = any(inc for _, _, inc in sizes)
                    base = item.base_price
                    absolute = (
                        not explicit
                        and base is not None
                        and all(p is not None and p >= base for _, p, _ in sizes)
                        and min(p for _, p, _ in sizes if p is not None) == base
                    )
                    item.sizes = [
                        ExtractedOption(
                            name=n, price=(p - base) if absolute and p is not None and base else p
                        )
                        for n, p, _ in sizes
                    ]
            extras, bad_extras = _options(cell("extras"))
            if bad_extras:
                item.issues.append("MISSING_OPTION_PRICE")
            for n, p, _ in extras:
                if all(e.name.lower() != n.lower() for e in item.extras):
                    item.extras.append(ExtractedOption(name=n, price=p))

    for key, variants in size_rows.items():
        item = grouped[key]
        variants.sort(key=lambda v: v[1])
        base = variants[0][1]
        item.base_price = base
        item.sizes = [ExtractedOption(name=label, price=price - base) for label, price in variants]

    if used_sheets == 0:
        raise ExtractionError(
            "NO_NAME_COLUMN",
            "No item name column was found. Use the template in docs/templates/menu-template.csv.",
        )
    return ExtractionOutput(
        items=list(grouped.values()),
        warnings=warnings,
        unparsed_lines=unparsed,
        meta={"sheets": used_sheets},
    )
