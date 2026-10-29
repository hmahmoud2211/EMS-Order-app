"""Tesseract OCR with OpenCV preprocessing (free, open source).

If Tesseract (or its Arabic language pack) is missing, callers get an explicit
status/warning — extraction never pretends to have worked.
"""

import shutil
from dataclasses import dataclass
from functools import lru_cache

import cv2
import numpy as np
import pytesseract
import structlog

from app.core.config import get_settings
from app.services.menu_import.types import Token

log = structlog.get_logger(__name__)


@dataclass(frozen=True)
class OcrAvailability:
    available: bool
    version: str | None
    languages: tuple[str, ...]
    message: str

    @property
    def arabic(self) -> bool:
        return "ara" in self.languages

    @property
    def english(self) -> bool:
        return "eng" in self.languages


@lru_cache
def ocr_availability() -> OcrAvailability:
    settings = get_settings()
    cmd = settings.tesseract_cmd or shutil.which("tesseract")
    if not cmd:
        return OcrAvailability(
            False,
            None,
            (),
            "Tesseract OCR is not installed on the server, so image and scanned-PDF menus cannot be read. "
            "Install tesseract-ocr with the 'eng' and 'ara' language packs (see docs/restaurant-imports.md), "
            "or import a text PDF, CSV or Excel menu instead.",
        )
    pytesseract.pytesseract.tesseract_cmd = cmd
    try:
        version = str(pytesseract.get_tesseract_version())
        languages = tuple(sorted(pytesseract.get_languages(config="")))
    except Exception as exc:  # pragma: no cover - environment specific
        return OcrAvailability(False, None, (), f"Tesseract is installed but not working: {exc}")
    message = "OCR is available."
    if "ara" not in languages:
        message = (
            "Arabic OCR language data ('ara') is not installed. Arabic text in images and scanned PDFs "
            "will not be recognized. Install tesseract-ocr-ara on the server."
        )
    return OcrAvailability(True, version, languages, message)


def ocr_languages() -> str:
    status = ocr_availability()
    wanted = [lang for lang in get_settings().ocr_languages.split("+") if lang]
    usable = [lang for lang in wanted if lang in status.languages]
    return "+".join(usable or ["eng"])


# ---- Preprocessing --------------------------------------------------------------


def deskew(gray: np.ndarray) -> tuple[np.ndarray, float]:
    """Estimate text skew from the foreground pixel cloud and rotate it level."""
    thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    ys, xs = np.nonzero(thresh)
    if len(xs) < 200:
        return gray, 0.0
    points = np.column_stack((xs, ys)).astype(np.float32)
    (_, _), (w, h), angle = cv2.minAreaRect(points)
    # Normalize OpenCV's angle convention to the smallest rotation in (-45, 45].
    if w < h:
        angle = angle - 90
    if angle <= -45:
        angle += 90
    elif angle > 45:
        angle -= 90
    if abs(angle) < 0.3 or abs(angle) > 20:
        return gray, 0.0
    height, width = gray.shape[:2]
    matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1.0)
    rotated = cv2.warpAffine(
        gray, matrix, (width, height), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )
    return rotated, float(angle)


def preprocess(image: np.ndarray) -> tuple[np.ndarray, dict]:
    """Grayscale → resize → denoise → contrast (CLAHE) → deskew → adaptive threshold."""
    info: dict = {}
    gray = image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    width = gray.shape[1]
    if width < 1400:
        scale = 1400 / width
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        info["upscaled"] = round(scale, 2)
    elif width > 3600:
        scale = 3600 / width
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        info["downscaled"] = round(scale, 2)
    gray = cv2.fastNlMeansDenoising(gray, h=10)
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    gray, angle = deskew(gray)
    info["deskew_degrees"] = round(angle, 2)
    binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15)
    return binary, info


def ocr_tokens(image: np.ndarray) -> tuple[list[Token], dict]:
    """Run Tesseract and return positioned word tokens with confidences (0..1)."""
    processed, info = preprocess(image)
    lang = ocr_languages()
    data = pytesseract.image_to_data(
        processed, lang=lang, config="--oem 1 --psm 3", output_type=pytesseract.Output.DICT
    )
    tokens: list[Token] = []
    for i, text in enumerate(data["text"]):
        text = (text or "").strip()
        try:
            conf = float(data["conf"][i])
        except (TypeError, ValueError):
            conf = -1
        if not text or conf < 0:
            continue
        left, top, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        tokens.append(Token(text=text, x0=left, y0=top, x1=left + w, y1=top + h, size=h, conf=conf / 100))
    info["language"] = lang
    info["width"] = int(processed.shape[1])
    return tokens, info
