from dataclasses import dataclass, field
from decimal import Decimal


class ExtractionError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


@dataclass
class Token:
    """A positioned piece of text (a PDF span or an OCR word)."""

    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    size: float
    bold: bool = False
    conf: float = 1.0

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2

    @property
    def height(self) -> float:
        return max(self.y1 - self.y0, 0.1)


@dataclass
class TextLine:
    text: str
    page: int
    size: float = 0.0
    bold: bool = False
    conf: float = 1.0
    ocr: bool = False


@dataclass
class ExtractedOption:
    name: str
    price: Decimal | None


@dataclass
class ExtractedItem:
    category: str
    name: str
    description: str | None = None
    base_price: Decimal | None = None
    sizes: list[ExtractedOption] = field(default_factory=list)
    extras: list[ExtractedOption] = field(default_factory=list)
    is_available: bool = True
    confidence: float = 1.0
    issues: list[str] = field(default_factory=list)
    source: dict = field(default_factory=dict)


@dataclass
class ExtractionOutput:
    items: list[ExtractedItem]
    warnings: list[dict] = field(default_factory=list)
    unparsed_lines: list[str] = field(default_factory=list)
    meta: dict = field(default_factory=dict)
