"""Image menus (JPG/PNG/WEBP): OpenCV preprocessing + Tesseract OCR."""

import io

import cv2
import numpy as np
from PIL import Image, ImageOps

from app.services.menu_import import ocr
from app.services.menu_import.layout import tokens_to_lines
from app.services.menu_import.parser import parse_lines
from app.services.menu_import.types import ExtractionError, ExtractionOutput


def decode_image(data: bytes) -> np.ndarray:
    try:
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            array = np.array(img)
    except Exception as exc:
        raise ExtractionError("INVALID_IMAGE", "The image could not be read.") from exc
    return cv2.cvtColor(array, cv2.COLOR_RGB2BGR)


def extract_image(data: bytes) -> ExtractionOutput:
    status = ocr.ocr_availability()
    if not status.available:
        raise ExtractionError("OCR_UNAVAILABLE", status.message)
    image = decode_image(data)
    tokens, info = ocr.ocr_tokens(image)
    if not tokens:
        raise ExtractionError(
            "NO_TEXT_FOUND",
            "No readable text was found in the image. Try a sharper, well-lit photo taken straight on.",
        )
    lines = tokens_to_lines(tokens, 1, info.get("width", image.shape[1]), ocr=True)
    output = parse_lines(lines)
    warnings = [
        {"code": "OCR_USED", "message": "This menu was read with OCR. Check names and prices carefully."}
    ]
    if not status.arabic:
        warnings.append({"code": "ARABIC_OCR_UNAVAILABLE", "message": status.message})
    average = sum(t.conf for t in tokens) / len(tokens)
    if average < 0.6:
        warnings.append(
            {
                "code": "LOW_OCR_CONFIDENCE",
                "message": f"OCR confidence is low ({average:.0%}). Many values may need correction.",
            }
        )
    output.warnings = warnings
    output.meta = {
        "ocr_language": info.get("language"),
        "deskew_degrees": info.get("deskew_degrees"),
        "average_ocr_confidence": round(average, 2),
        "lines": len(lines),
    }
    return output
