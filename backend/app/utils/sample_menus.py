"""Generate fictional sample menu files (CSV, XLSX, text PDF, PNG) for tests and demos."""

import csv
import io
from pathlib import Path

from openpyxl import Workbook

SAMPLE_ROWS = [
    # category, name, description, price, sizes, extras, available
    (
        "Burgers",
        "Chicken Burger",
        "Crispy chicken breast, lettuce, house sauce",
        "180",
        "Regular:0|Large:+35",
        "Cheese:20|Sauce:10",
        "yes",
    ),
    (
        "Burgers",
        "Classic Beef Burger",
        "Grilled beef patty, pickles, onions",
        "210",
        "Regular:0|Double:+70",
        "Cheese:20|Bacon:30",
        "yes",
    ),
    ("Pasta", "Chicken Pasta", "Penne, grilled chicken, creamy white sauce", "185", "", "Parmesan:15", "yes"),
    ("Pasta", "Arrabbiata", "Penne in spicy tomato sauce", "150", "", "", "yes"),
    ("Sides", "French Fries", "Golden fries with sea salt", "60", "Regular:0|Large:+20", "", "yes"),
    ("Drinks", "Cola", "330 ml can", "35", "", "", "yes"),
    ("Drinks", "Fresh Orange Juice", "", "55", "", "", "no"),
]

PDF_LINES = [
    ("BURGERS", "heading"),
    ("Chicken Burger ........ 180 EGP", "item"),
    ("Crispy chicken breast, lettuce and house sauce", "desc"),
    ("+ Cheese 20", "item"),
    ("Classic Beef Burger ........ 210 EGP", "item"),
    ("PASTA", "heading"),
    ("Chicken Pasta ........ 185 EGP", "item"),
    ("Penne with grilled chicken in a creamy white sauce", "desc"),
    ("Arrabbiata ........ 150 EGP", "item"),
    ("PIZZA", "heading"),
    ("Small    Medium    Large", "item"),
    ("Margherita    120    150    185", "item"),
    ("DRINKS", "heading"),
    ("Cola ........ 35 EGP", "item"),
]


def sample_csv() -> bytes:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["category", "name", "description", "price", "sizes", "extras", "available"])
    writer.writerows(SAMPLE_ROWS)
    return out.getvalue().encode("utf-8")


def sample_xlsx() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Menu"
    ws.append(["Sample Restaurant — Menu"])  # a title row the importer must skip
    ws.append(["Category", "Item Name", "Description", "Price (EGP)", "Size", "Extras", "Available"])
    for row in SAMPLE_ROWS:
        ws.append(list(row))
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def sample_pdf() -> bytes:
    from reportlab.lib.pagesizes import A5
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A5)
    _, height = A5
    y = height - 50
    for text, kind in PDF_LINES:
        if kind == "heading":
            y -= 10
            c.setFont("Helvetica-Bold", 15)
        elif kind == "desc":
            c.setFont("Helvetica", 8.5)
        else:
            c.setFont("Helvetica", 11)
        c.drawString(36, y, text)
        y -= 20 if kind == "heading" else 16
    c.showPage()
    c.save()
    return buffer.getvalue()


def sample_png() -> bytes:
    """Render the sample PDF to an image, simulating a photographed menu."""
    import pymupdf

    doc = pymupdf.open(stream=sample_pdf(), filetype="pdf")
    pix = doc[0].get_pixmap(dpi=200)
    return pix.tobytes("png")


def write_all(target: Path) -> list[Path]:
    target.mkdir(parents=True, exist_ok=True)
    files = {
        "sample-menu.csv": sample_csv(),
        "sample-menu.xlsx": sample_xlsx(),
        "sample-menu.pdf": sample_pdf(),
        "sample-menu.png": sample_png(),
    }
    paths = []
    for name, data in files.items():
        path = target / name
        path.write_bytes(data)
        paths.append(path)
    return paths
