"""PDF menus: PyMuPDF text/layout extraction with OCR fallback for scanned pages."""

import numpy as np
import pymupdf

from app.core.config import get_settings
from app.services.menu_import import ocr
from app.services.menu_import.layout import tokens_to_lines
from app.services.menu_import.parser import parse_lines
from app.services.menu_import.types import ExtractionError, ExtractionOutput, TextLine, Token

BOLD_FLAG = 1 << 4


def _page_tokens(page: "pymupdf.Page") -> list[Token]:
    tokens: list[Token] = []
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = (span.get("text") or "").strip()
                if not text:
                    continue
                x0, y0, x1, y1 = span["bbox"]
                font = (span.get("font") or "").lower()
                tokens.append(
                    Token(
                        text=text,
                        x0=x0,
                        y0=y0,
                        x1=x1,
                        y1=y1,
                        size=float(span.get("size") or 0),
                        bold=bool(span.get("flags", 0) & BOLD_FLAG) or "bold" in font or "black" in font,
                    )
                )
    return tokens


def extract_pdf(data: bytes) -> ExtractionOutput:
    settings = get_settings()
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise ExtractionError("INVALID_PDF", "The PDF could not be opened. It may be damaged.") from exc
    if doc.needs_pass:
        raise ExtractionError("PDF_ENCRYPTED", "The PDF is password-protected. Upload an unlocked copy.")
    if doc.page_count > settings.max_menu_pdf_pages:
        raise ExtractionError(
            "PDF_TOO_LONG", f"The PDF has {doc.page_count} pages; the limit is {settings.max_menu_pdf_pages}."
        )

    warnings: list[dict] = []
    lines: list[TextLine] = []
    ocr_pages: list[int] = []
    skipped_pages: list[int] = []
    ocr_info: dict = {}
    for index, page in enumerate(doc, start=1):
        tokens = _page_tokens(page)
        chars = sum(len(t.text) for t in tokens)
        if chars >= settings.ocr_min_text_chars_per_page:
            lines.extend(tokens_to_lines(tokens, index, page.rect.width, ocr=False))
            continue
        status = ocr.ocr_availability()
        if not status.available:
            skipped_pages.append(index)
            continue
        pix = page.get_pixmap(dpi=300, colorspace=pymupdf.csGRAY)
        image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
        page_tokens, ocr_info = ocr.ocr_tokens(image)
        lines.extend(tokens_to_lines(page_tokens, index, ocr_info.get("width", pix.width), ocr=True))
        ocr_pages.append(index)

    if skipped_pages:
        warnings.append(
            {
                "code": "OCR_UNAVAILABLE",
                "message": f"Pages {', '.join(map(str, skipped_pages))} look scanned, "
                "but OCR is not available. " + ocr.ocr_availability().message,
            }
        )
    if ocr_pages and not ocr.ocr_availability().arabic:
        warnings.append({"code": "ARABIC_OCR_UNAVAILABLE", "message": ocr.ocr_availability().message})
    if ocr_pages:
        warnings.append(
            {
                "code": "OCR_USED",
                "message": f"Pages {', '.join(map(str, ocr_pages))} were read with OCR. "
                "Check names and prices.",
            }
        )
    if not lines and skipped_pages:
        raise ExtractionError("OCR_UNAVAILABLE", ocr.ocr_availability().message)

    output = parse_lines(lines)
    output.warnings = warnings
    output.meta = {
        "pages": doc.page_count,
        "ocr_pages": ocr_pages,
        "ocr_language": ocr_info.get("language"),
        "lines": len(lines),
    }
    return output
