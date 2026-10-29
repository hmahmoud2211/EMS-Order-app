"""Rebuild reading order from positioned tokens: detect columns, then group rows."""

from statistics import median

from app.services.menu_import.types import TextLine, Token

_BUCKETS = 200


def split_columns(tokens: list[Token], x_min: float, x_max: float, depth: int = 0) -> list[list[Token]]:
    """Split a page into columns at the widest vertical gutter (between 25% and 75% of the width)."""
    if len(tokens) < 12 or depth > 1 or x_max - x_min <= 0:
        return [tokens]
    width = x_max - x_min
    res = width / _BUCKETS
    coverage = [0] * (_BUCKETS + 1)
    for t in tokens:
        start = max(0, int((t.x0 - x_min) / res))
        end = min(_BUCKETS, int((t.x1 - x_min) / res))
        for b in range(start, end + 1):
            coverage[b] += 1
    tolerance = max(1, int(len(tokens) * 0.03))  # allow a page title to span the gutter
    best: tuple[int, int] | None = None
    i = int(_BUCKETS * 0.25)
    stop = int(_BUCKETS * 0.75)
    while i < stop:
        if coverage[i] <= tolerance:
            j = i
            while j < stop and coverage[j] <= tolerance:
                j += 1
            if j - i >= 3 and (best is None or j - i > best[1]):
                best = (i, j - i)
            i = j
        else:
            i += 1
    if best is None:
        return [tokens]
    split_x = x_min + (best[0] + best[1] / 2) * res
    left = [t for t in tokens if (t.x0 + t.x1) / 2 < split_x]
    right = [t for t in tokens if (t.x0 + t.x1) / 2 >= split_x]
    if len(left) < 4 or len(right) < 4:
        return [tokens]
    return split_columns(left, x_min, split_x, depth + 1) + split_columns(right, split_x, x_max, depth + 1)


def group_rows(tokens: list[Token], page: int, ocr: bool) -> list[TextLine]:
    rows: list[list[Token]] = []
    centers: list[float] = []
    heights: list[float] = []
    for token in sorted(tokens, key=lambda t: (t.cy, t.x0)):
        if rows and abs(token.cy - centers[-1]) <= max(token.height, heights[-1]) * 0.5:
            rows[-1].append(token)
            n = len(rows[-1])
            centers[-1] = (centers[-1] * (n - 1) + token.cy) / n
            heights[-1] = max(heights[-1], token.height)
        else:
            rows.append([token])
            centers.append(token.cy)
            heights.append(token.height)

    lines: list[TextLine] = []
    for row in rows:
        row.sort(key=lambda t: t.x0)
        parts: list[str] = []
        for idx, token in enumerate(row):
            if idx:
                prev = row[idx - 1]
                char_w = max((prev.x1 - prev.x0) / max(len(prev.text), 1), 1)
                gap = token.x0 - prev.x1
                parts.append("   " if gap > char_w * 2.5 else " ")
            parts.append(token.text)
        text = "".join(parts).strip()
        if not text:
            continue
        lines.append(
            TextLine(
                text=text,
                page=page,
                size=median(t.size for t in row),
                bold=sum(1 for t in row if t.bold) > len(row) / 2,
                conf=sum(t.conf for t in row) / len(row),
                ocr=ocr,
            )
        )
    return lines


def tokens_to_lines(tokens: list[Token], page: int, page_width: float, ocr: bool) -> list[TextLine]:
    if not tokens:
        return []
    columns = split_columns(tokens, 0, page_width)
    lines: list[TextLine] = []
    for column in columns:
        lines.extend(group_rows(column, page, ocr))
    return lines
