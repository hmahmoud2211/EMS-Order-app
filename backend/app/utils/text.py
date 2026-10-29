import re
import unicodedata

_ARABIC_INDIC = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_ARABIC_RE = re.compile(r"[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]")


def normalize_digits(text: str) -> str:
    """Convert Arabic-Indic / Persian digits and Arabic decimal separators to ASCII."""
    return text.translate(_ARABIC_INDIC).replace("٫", ".").replace("٬", ",")


def contains_arabic(text: str) -> bool:
    return bool(_ARABIC_RE.search(text or ""))


def normalize_name(text: str) -> str:
    """Lower-cased, accent-free, whitespace-collapsed key for fuzzy comparisons."""
    text = unicodedata.normalize("NFKC", text or "").lower()
    text = re.sub(r"[^\w\s؀-ۿ]", " ", text)
    return " ".join(text.split())


def username_from_name(full_name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", full_name).encode("ascii", "ignore").decode()
    parts = [p for p in re.split(r"[^a-zA-Z0-9]+", ascii_name.lower()) if p]
    if not parts:
        return "employee"
    if len(parts) == 1:
        return parts[0][:60]
    return f"{parts[0]}.{parts[-1]}"[:60]
