"""Deterministic menu text parser.

Turns reading-ordered text lines into categories and items using layout clues
(font size, boldness) and explicit textual patterns. It never invents items or
prices: lines it cannot interpret are reported back as "unparsed" for the
admin, and items without a recognizable price keep ``base_price=None``.
"""

import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from statistics import median

from app.services.menu_import.types import ExtractedItem, ExtractedOption, ExtractionOutput, TextLine
from app.utils.text import contains_arabic, normalize_digits

CURRENCY = r"(?:EGP|L\.?E\.?|E£|£|ج\.?\s?م\.?|جنيه(?:ا|اً)?|جم)"
PRICE = r"(?:\d{1,3}(?:,\d{3})+|\d{1,5})(?:\.\d{1,2})?"

SIZE_WORDS = [
    "small",
    "medium",
    "large",
    "regular",
    "reg",
    "mini",
    "double",
    "single",
    "triple",
    "family",
    "jumbo",
    "big",
    "half",
    "full",
    "quarter",
    "personal",
    "kids",
    "solo",
    "meal",
    "sandwich",
    "combo",
    "xxl",
    "xl",
    "sm",
    "md",
    "lg",
    "s",
    "m",
    "l",
    "1/4",
    "1/2",
    "صغير",
    "وسط",
    "كبير",
    "عادي",
    "دبل",
    "سنجل",
    "تريبل",
    "عائلي",
    "جامبو",
    "نص",
    "ربع",
    "كامل",
    "وجبة",
    "ساندوتش",
    "سندوتش",
]
_SIZE_ALT = "|".join(sorted((re.escape(w) for w in SIZE_WORDS), key=len, reverse=True))
SIZE_SET = {w.lower() for w in SIZE_WORDS}

CATEGORY_KEYWORDS = {
    "burger",
    "burgers",
    "sandwich",
    "sandwiches",
    "pizza",
    "pizzas",
    "pasta",
    "salad",
    "salads",
    "appetizers",
    "starters",
    "sides",
    "side dishes",
    "desserts",
    "drinks",
    "beverages",
    "hot drinks",
    "cold drinks",
    "juices",
    "main",
    "mains",
    "main courses",
    "main dishes",
    "meals",
    "combos",
    "offers",
    "breakfast",
    "soup",
    "soups",
    "grills",
    "grill",
    "chicken",
    "beef",
    "seafood",
    "fish",
    "wraps",
    "crepes",
    "sushi",
    "kids",
    "kids menu",
    "extras",
    "add-ons",
    "addons",
    "sauces",
    "shawarma",
    "koshary",
    "fateer",
    "rice",
    "noodles",
    "platters",
    "ساندوتشات",
    "سندوتشات",
    "برجر",
    "بيتزا",
    "مكرونة",
    "مكرونات",
    "باستا",
    "سلطات",
    "مقبلات",
    "حلويات",
    "مشروبات",
    "عصائر",
    "وجبات",
    "عروض",
    "فطار",
    "إفطار",
    "شوربة",
    "شوربات",
    "مشويات",
    "فراخ",
    "لحوم",
    "مأكولات بحرية",
    "أسماك",
    "كريب",
    "اضافات",
    "إضافات",
    "صوصات",
    "شاورما",
    "كشري",
    "فطير",
    "أرز",
}

_TRAILING_PRICE = re.compile(
    rf"(?:^|(?<=[\s:|/\-–—=(]))(?:{CURRENCY}\s*)?({PRICE})\s*(?:{CURRENCY})?\s*\)?\s*$", re.IGNORECASE
)
_LABELED_PRICE = re.compile(
    rf"(?<![\w])\(?({_SIZE_ALT})\)?\s*[:=\-–]?\s*(?:{CURRENCY}\s*)?({PRICE})(?:\s*{CURRENCY})?", re.IGNORECASE
)
_CURRENCY_ONLY = re.compile(rf"\s*{CURRENCY}\s*", re.IGNORECASE)
_ENUM_PREFIX = re.compile(r"^\s*(?:\d{1,2}[.)\-]\s+|[•*·▪●◦\-–]\s*)")
_LEADERS = re.compile(r"[.·…_]{3,}|-{3,}|\.{2,}\s*$")
_EXTRA_PREFIX = re.compile(
    r"^\s*(?:\+\s*|add[\s-]?on[s]?\b[:\s]*|add\b[:\s]*|extras?\b[:\s]*|إضافة\s*|اضافة\s*|اضافه\s*|زيادة\s*)",
    re.IGNORECASE,
)
_TRIM = " \t-–—:|/.,•*"

MAX_PRICE = Decimal("20000")


def to_price(raw: str) -> Decimal | None:
    try:
        value = Decimal(raw.replace(",", ""))
    except InvalidOperation:
        return None
    if value < 0 or value > MAX_PRICE:
        return None
    return value.quantize(Decimal("0.01"))


def clean_text(text: str) -> str:
    """ASCII digits, dot-leaders removed, whitespace collapsed."""
    text = normalize_digits(text)
    text = _LEADERS.sub(" ", text)
    return " ".join(text.split())


@dataclass
class LineInfo:
    kind: str  # ITEM | PRICE_ONLY | SIZE_HEADER | EXTRA | TEXT
    name: str = ""
    prices: list[Decimal] = field(default_factory=list)
    labels: list[str] = field(default_factory=list)


def _strip_enum(text: str) -> str:
    return _ENUM_PREFIX.sub("", text, count=1)


def classify(raw: str) -> LineInfo:
    text = clean_text(raw)
    if not text:
        return LineInfo("TEXT")

    extra = _EXTRA_PREFIX.match(text)
    if extra and extra.end() < len(text):
        rest = text[extra.end() :]
        info = _extract_prices(rest)
        if info.prices and info.name:
            return LineInfo("EXTRA", name=info.name, prices=info.prices[:1])

    # Labeled sizes, e.g. "Pizza Margherita S 80 / M 100 / L 120"
    pairs = list(_LABELED_PRICE.finditer(text))
    if len(pairs) >= 2:
        name = _strip_enum(text[: pairs[0].start()]).strip(_TRIM)
        prices = [to_price(p.group(2)) for p in pairs]
        if all(p is not None for p in prices):
            return LineInfo(
                "ITEM" if name else "PRICE_ONLY",
                name=" ".join(name.split()),
                prices=prices,  # type: ignore[arg-type]
                labels=[p.group(1) for p in pairs],
            )

    # Size header, e.g. "Small   Medium   Large"
    words = [w for w in re.split(r"[\s/|]+", text) if w]
    if 2 <= len(words) <= 4 and all(w.lower().strip("()") in SIZE_SET for w in words):
        return LineInfo("SIZE_HEADER", labels=[w.strip("()") for w in words])

    info = _extract_prices(_strip_enum(text))
    if info.prices:
        return LineInfo("ITEM" if info.name else "PRICE_ONLY", name=info.name, prices=info.prices)
    return LineInfo("TEXT", name=" ".join(_strip_enum(text).split()).strip(_TRIM))


def _extract_prices(text: str) -> LineInfo:
    rest = text
    prices: list[Decimal] = []
    had_currency = bool(re.search(CURRENCY, text, re.IGNORECASE))
    for _ in range(4):
        match = _TRAILING_PRICE.search(rest)
        if not match:
            break
        raw = match.group(1)
        value = to_price(raw)
        if value is None:
            break
        prices.insert(0, value)
        rest = rest[: match.start()].rstrip(_TRIM + " ")
        if not rest:
            break
    name = " ".join(_CURRENCY_ONLY.sub(" ", rest).split()).strip(_TRIM)
    # A lone small integer without currency is more likely a count ("Combo 2") than a price.
    if len(prices) == 1 and prices[0] < 5 and not had_currency and "." not in text.split()[-1]:
        return LineInfo("TEXT", name=" ".join(text.split()))
    return LineInfo("ITEM", name=name, prices=prices)


def heading_score(line: TextLine, median_size: float, name: str) -> float:
    words = name.split()
    if not words:
        return -10
    score = 0.0
    if line.bold:
        score += 2
    if median_size and line.size >= median_size * 1.2:
        score += 2
    latin = re.sub(r"[^A-Za-z]", "", name)
    if latin and latin.isupper() and len(latin) >= 3:
        score += 1.5
    if line.text.strip().endswith(":"):
        score += 1
    if len(words) <= 4:
        score += 1
    elif len(words) > 7:
        score -= 3
    if name.lower().strip(":") in CATEGORY_KEYWORDS or any(w.lower() in CATEGORY_KEYWORDS for w in words[:2]):
        score += 2
    if name[0].isalpha() and name[0].islower() and not contains_arabic(name[0]):
        score -= 2
    if re.search(r"\d", name):
        score -= 1.5
    return score


class _Parser:
    def __init__(self, lines: list[TextLine]) -> None:
        self.lines = lines
        sizes = [line.size for line in lines if line.size]
        self.median_size = median(sizes) if sizes else 0.0
        self.items: list[ExtractedItem] = []
        self.unparsed: list[str] = []
        self.category = "Menu"
        self.size_labels: list[str] | None = None
        self.pending: tuple[TextLine, LineInfo] | None = None

    @property
    def last_item(self) -> ExtractedItem | None:
        return self.items[-1] if self.items else None

    def _make_item(self, name: str, prices: list[Decimal], labels: list[str], line: TextLine) -> None:
        item = ExtractedItem(
            category=self.category,
            name=name,
            confidence=line.conf,
            source={"page": line.page, "line": line.text[:200], "ocr": line.ocr},
        )
        if len(prices) == 1:
            item.base_price = prices[0]
        elif len(prices) > 1:
            if not labels and self.size_labels and len(self.size_labels) == len(prices):
                labels = self.size_labels
            if not labels:
                labels = [f"Option {i + 1}" for i in range(len(prices))]
                item.issues.append("UNLABELED_SIZES")
            pairs = sorted(zip(labels, prices, strict=True), key=lambda lp: lp[1])
            base = pairs[0][1]
            item.base_price = base
            item.sizes = [
                ExtractedOption(name=label.title() if label.isascii() else label, price=p - base)
                for label, p in pairs
            ]
        self.items.append(item)

    def _resolve_pending(self) -> None:
        if self.pending is None:
            return
        line, info = self.pending
        self.pending = None
        name = info.name
        if not name:
            return
        score = heading_score(line, self.median_size, name)
        if score >= 2.5:
            self.category = name.strip(":").strip()
            self.size_labels = None
            return
        words = name.split()
        last = self.last_item
        if last is not None and last.category == self.category and (len(words) >= 3 or "," in name):
            if not last.description:
                last.description = name
            elif len(last.description) < 300:
                last.description = f"{last.description} {name}"
            return
        if score >= 1.5 and len(words) <= 5:
            self.category = name.strip(":").strip()
            self.size_labels = None
            return
        self.unparsed.append(line.text[:200])

    def run(self) -> tuple[list[ExtractedItem], list[str]]:
        for line in self.lines:
            info = classify(line.text)
            if info.kind == "SIZE_HEADER":
                self._resolve_pending()
                self.size_labels = info.labels
            elif info.kind == "PRICE_ONLY":
                if self.pending is not None:
                    pending_line, pending_info = self.pending
                    self.pending = None
                    if pending_info.name:
                        self._make_item(pending_info.name, info.prices, info.labels, pending_line)
                        continue
                last = self.last_item
                if last is not None and last.base_price is None:
                    last.base_price = info.prices[0]
                else:
                    self.unparsed.append(line.text[:200])
            elif info.kind == "ITEM":
                self._resolve_pending()
                self._make_item(info.name, info.prices, info.labels, line)
            elif info.kind == "EXTRA":
                self._resolve_pending()
                last = self.last_item
                option = ExtractedOption(name=info.name, price=info.prices[0] if info.prices else None)
                if last is not None and last.category == self.category:
                    last.extras.append(option)
                else:
                    item = ExtractedItem(
                        category="Extras",
                        name=info.name,
                        base_price=option.price,
                        confidence=line.conf,
                        source={"page": line.page, "line": line.text[:200], "ocr": line.ocr},
                    )
                    self.items.append(item)
            else:
                self._resolve_pending()
                self.pending = (line, info)
        self._resolve_pending()
        return self.items, self.unparsed


def parse_lines(lines: list[TextLine]) -> ExtractionOutput:
    items, unparsed = _Parser(lines).run()
    return ExtractionOutput(items=items, unparsed_lines=unparsed)
