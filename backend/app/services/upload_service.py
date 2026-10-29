"""File upload validation and storage.

Public images live under ``MEDIA_ROOT/public`` (served at ``/media``). Menu import
source files live under ``MEDIA_ROOT/private`` and are never served statically.
"""

import io
import uuid
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import get_settings
from app.core.errors import BusinessRuleError

Image.MAX_IMAGE_PIXELS = 60_000_000  # guard against decompression bombs

MAX_IMAGE_DIMENSION = 1600
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}


def public_dir() -> Path:
    path = get_settings().media_root / "public"
    path.mkdir(parents=True, exist_ok=True)
    return path


def private_dir() -> Path:
    path = get_settings().media_root / "private"
    path.mkdir(parents=True, exist_ok=True)
    return path


async def read_limited(upload: UploadFile, max_mb: int) -> bytes:
    limit = max_mb * 1024 * 1024
    data = await upload.read(limit + 1)
    if len(data) > limit:
        raise BusinessRuleError(f"The file is larger than {max_mb} MB.", code="FILE_TOO_LARGE")
    if not data:
        raise BusinessRuleError("The uploaded file is empty.", code="EMPTY_FILE")
    return data


def save_image(data: bytes, folder: str = "images") -> str:
    """Validate, normalize (EXIF rotation, size) and store an image. Returns its public URL path."""
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        image = Image.open(io.BytesIO(data))
        fmt = image.format
        image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise BusinessRuleError(
            "The file is not a valid image. Upload a JPG, PNG or WEBP.", code="INVALID_IMAGE"
        ) from exc
    if fmt not in ALLOWED_IMAGE_FORMATS:
        raise BusinessRuleError("Only JPG, PNG and WEBP images are supported.", code="INVALID_IMAGE")

    image = ImageOps.exif_transpose(image)
    image.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION))
    has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
    target_dir = public_dir() / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    name = uuid.uuid4().hex
    if has_alpha:
        filename = f"{name}.png"
        image.convert("RGBA").save(target_dir / filename, "PNG", optimize=True)
    else:
        filename = f"{name}.jpg"
        image.convert("RGB").save(target_dir / filename, "JPEG", quality=85, optimize=True, progressive=True)
    return f"{get_settings().media_url_prefix}/{folder}/{filename}"


def store_private(data: bytes, folder: str, extension: str) -> str:
    target_dir = private_dir() / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.{extension}"
    (target_dir / filename).write_bytes(data)
    return f"{folder}/{filename}"


def read_private(relative_path: str) -> bytes:
    base = private_dir().resolve()
    path = (base / relative_path).resolve()
    if base not in path.parents:
        raise BusinessRuleError("Invalid stored file path.", code="INVALID_PATH")
    return path.read_bytes()
