"""Identify uploaded menu files by content (magic bytes), not by the client's claims."""

import io
import zipfile

from app.models.enums import ImportSourceType
from app.services.menu_import.types import ExtractionError


def detect_source_type(data: bytes, filename: str) -> tuple[ImportSourceType, str]:
    """Return (source type, file extension) or raise ExtractionError."""
    head = data[:16]
    if head.startswith(b"%PDF"):
        return ImportSourceType.PDF, "pdf"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return ImportSourceType.IMAGE, "png"
    if head.startswith(b"\xff\xd8\xff"):
        return ImportSourceType.IMAGE, "jpg"
    if head[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ImportSourceType.IMAGE, "webp"
    if head.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                names = archive.namelist()
        except zipfile.BadZipFile as exc:
            raise ExtractionError("UNSUPPORTED_FILE_TYPE", "The file is a damaged archive.") from exc
        if any(n.startswith("xl/") for n in names):
            return ImportSourceType.XLSX, "xlsx"
        raise ExtractionError(
            "UNSUPPORTED_FILE_TYPE", "Only .xlsx spreadsheets are supported (not other Office files)."
        )
    if filename.lower().endswith((".csv", ".txt")) and b"\x00" not in data[:4096]:
        return ImportSourceType.CSV, "csv"
    raise ExtractionError(
        "UNSUPPORTED_FILE_TYPE",
        "Unsupported file. Upload a PDF, JPG, PNG, WEBP, CSV or XLSX menu.",
    )
