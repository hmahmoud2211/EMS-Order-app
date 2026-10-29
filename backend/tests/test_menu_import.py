from decimal import Decimal

import numpy as np
import pytest

from app.services.menu_import import ocr
from app.services.menu_import.detect import detect_source_type
from app.services.menu_import.parser import classify, parse_lines
from app.services.menu_import.types import ExtractionError, TextLine
from app.utils import sample_menus

API = "/api/v1"
HAS_TESSERACT = ocr.ocr_availability().available


# ---- Unit: detection & parsing ------------------------------------------------------


def test_detect_types_by_content():
    assert detect_source_type(sample_menus.sample_pdf(), "x.bin")[0] == "PDF"
    assert detect_source_type(sample_menus.sample_png(), "x.bin")[0] == "IMAGE"
    assert detect_source_type(sample_menus.sample_xlsx(), "x.bin")[0] == "XLSX"
    assert detect_source_type(sample_menus.sample_csv(), "menu.csv")[0] == "CSV"
    with pytest.raises(ExtractionError):
        detect_source_type(b"MZ\x90\x00 not a menu", "menu.exe")


@pytest.mark.parametrize(
    ("text", "kind", "name", "prices"),
    [
        ("Chicken Burger ........ 180 EGP", "ITEM", "Chicken Burger", ["180.00"]),
        ("1. Chicken Pasta - 185", "ITEM", "Chicken Pasta", ["185.00"]),
        ("فراخ مشوية ٢٢٠ ج.م", "ITEM", "فراخ مشوية", ["220.00"]),
        ("Pizza Margherita S 80 / M 100 / L 120", "ITEM", "Pizza Margherita", ["80.00", "100.00", "120.00"]),
        ("Combo 2", "TEXT", None, []),
        ("Pepsi 330ml 15", "ITEM", "Pepsi 330ml", ["15.00"]),
        ("Small Medium Large", "SIZE_HEADER", None, []),
        ("185", "PRICE_ONLY", None, ["185.00"]),
        ("+ Cheese 20", "EXTRA", "Cheese", ["20.00"]),
    ],
)
def test_classify_lines(text, kind, name, prices):
    info = classify(text)
    assert info.kind == kind
    if name is not None:
        assert info.name == name
    assert [f"{p:.2f}" for p in info.prices] == prices


def test_parser_builds_categories_sizes_descriptions_and_extras():
    lines = [
        TextLine("BURGERS", 1, size=15, bold=True),
        TextLine("Chicken Burger ..... 180", 1, size=11),
        TextLine("Crispy chicken breast, lettuce and sauce", 1, size=8.5),
        TextLine("+ Cheese 20", 1, size=11),
        TextLine("PIZZA", 1, size=15, bold=True),
        TextLine("Small Medium Large", 1, size=11),
        TextLine("Margherita 120 150 185", 1, size=11),
        TextLine("Grilled Halloumi Wrap", 1, size=11),
        TextLine("95", 1, size=11),
        TextLine("Call us: 19999", 1, size=9),
    ]
    output = parse_lines(lines)
    items = {i.name: i for i in output.items}
    burger = items["Chicken Burger"]
    assert burger.category == "BURGERS"
    assert burger.base_price == Decimal("180.00")
    assert burger.description.startswith("Crispy chicken")
    assert [(e.name, e.price) for e in burger.extras] == [("Cheese", Decimal("20.00"))]
    pizza = items["Margherita"]
    assert pizza.category == "PIZZA"
    assert pizza.base_price == Decimal("120.00")
    assert [(s.name, s.price) for s in pizza.sizes] == [
        ("Small", Decimal("0.00")),
        ("Medium", Decimal("30.00")),
        ("Large", Decimal("65.00")),
    ]
    assert items["Grilled Halloumi Wrap"].base_price == Decimal("95.00")


def test_parser_never_invents_prices():
    output = parse_lines([TextLine("DRINKS", 1, size=14, bold=True), TextLine("Some tagline about us", 1)])
    assert output.items == []
    assert output.unparsed_lines


def test_deskew_levels_rotated_text():
    import cv2

    image = np.full((600, 900), 255, dtype=np.uint8)
    for y in range(80, 560, 40):
        cv2.putText(image, "MENU ITEM NAME 120 EGP", (60, y), cv2.FONT_HERSHEY_SIMPLEX, 1, 0, 2)
    matrix = cv2.getRotationMatrix2D((450, 300), 4, 1.0)
    rotated = cv2.warpAffine(image, matrix, (900, 600), borderValue=255)
    _, angle = ocr.deskew(rotated)
    assert 2.5 <= abs(angle) <= 5.5


# ---- API: import lifecycle ---------------------------------------------------------------


def create_restaurant(client, headers):
    return client.post(f"{API}/restaurants", json={"name": "Import Test"}, headers=headers).json()["id"]


def upload(client, headers, rid, data, filename, force=False):
    return client.post(
        f"{API}/restaurants/{rid}/menu/import",
        files={"file": (filename, data, "application/octet-stream")},
        data={"force": str(force).lower()},
        headers=headers,
    )


def test_csv_import_review_and_approve(client, admin_headers):
    rid = create_restaurant(client, admin_headers)
    response = upload(client, admin_headers, rid, sample_menus.sample_csv(), "menu.csv")
    assert response.status_code == 202, response.text
    import_id = response.json()["id"]

    detail = client.get(f"{API}/restaurants/{rid}/menu/imports/{import_id}", headers=admin_headers).json()
    assert detail["status"] == "NEEDS_REVIEW"
    items = {i["name"]: i for i in detail["extraction_result"]["items"]}
    burger = items["Chicken Burger"]
    assert burger["category"] == "Burgers"
    assert burger["base_price"] == "180.00"
    assert [(s["name"], s["price"]) for s in burger["sizes"]] == [("Regular", "0.00"), ("Large", "35.00")]
    assert [e["name"] for e in burger["extras"]] == ["Cheese", "Sauce"]
    assert items["Fresh Orange Juice"]["is_available"] is False

    # Nothing is published before approval.
    assert client.get(f"{API}/restaurants/{rid}/menu", headers=admin_headers).json()["item_count"] == 0

    # Admin edits: fix a price, delete an item, add a missing one.
    edited = [i for i in detail["extraction_result"]["items"] if i["name"] != "Cola"]
    for item in edited:
        if item["name"] == "Arrabbiata":
            item["base_price"] = "155.00"
    edited.append({"id": "manual-1", "category": "Desserts", "name": "Brownie", "base_price": "75"})
    patched = client.patch(
        f"{API}/restaurants/{rid}/menu/imports/{import_id}", json={"items": edited}, headers=admin_headers
    ).json()
    assert patched["stats"]["items"] == len(edited)

    approved = client.post(
        f"{API}/restaurants/{rid}/menu/imports/{import_id}/approve",
        json={"mode": "replace"},
        headers=admin_headers,
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "APPROVED"
    menu = client.get(f"{API}/restaurants/{rid}/menu", headers=admin_headers).json()
    names = {i["name"]: i for c in menu["categories"] for i in c["items"]}
    assert "Cola" not in names and "Brownie" in names
    assert names["Arrabbiata"]["base_price"] == "155.00"
    size_group = names["Chicken Burger"]["modifier_groups"][0]
    assert size_group["name"] == "Size" and size_group["is_required"] is True


def test_xlsx_import_with_title_row(client, admin_headers):
    rid = create_restaurant(client, admin_headers)
    import_id = upload(client, admin_headers, rid, sample_menus.sample_xlsx(), "menu.xlsx").json()["id"]
    detail = client.get(f"{API}/restaurants/{rid}/menu/imports/{import_id}", headers=admin_headers).json()
    assert detail["status"] == "NEEDS_REVIEW"
    assert len(detail["extraction_result"]["items"]) == len(sample_menus.SAMPLE_ROWS)


def test_text_pdf_import(client, admin_headers):
    rid = create_restaurant(client, admin_headers)
    import_id = upload(client, admin_headers, rid, sample_menus.sample_pdf(), "menu.pdf").json()["id"]
    detail = client.get(f"{API}/restaurants/{rid}/menu/imports/{import_id}", headers=admin_headers).json()
    assert detail["status"] == "NEEDS_REVIEW", detail
    items = {i["name"]: i for i in detail["extraction_result"]["items"]}
    assert items["Chicken Burger"]["base_price"] == "180.00"
    assert items["Chicken Burger"]["category"] == "BURGERS"
    assert items["Chicken Pasta"]["category"] == "PASTA"
    assert [s["name"] for s in items["Margherita"]["sizes"]] == ["Small", "Medium", "Large"]
    assert detail["extraction_result"]["meta"]["ocr_pages"] == []


def test_publish_blocked_until_problems_fixed(client, admin_headers):
    rid = create_restaurant(client, admin_headers)
    import_id = upload(client, admin_headers, rid, sample_menus.sample_csv(), "menu.csv").json()["id"]
    detail = client.get(f"{API}/restaurants/{rid}/menu/imports/{import_id}", headers=admin_headers).json()
    items = detail["extraction_result"]["items"]
    items[0]["base_price"] = None
    client.patch(
        f"{API}/restaurants/{rid}/menu/imports/{import_id}", json={"items": items}, headers=admin_headers
    )
    blocked = client.post(
        f"{API}/restaurants/{rid}/menu/imports/{import_id}/approve",
        json={"mode": "replace"},
        headers=admin_headers,
    )
    assert blocked.json()["error"]["code"] == "IMPORT_HAS_ERRORS"


def test_import_never_silently_replaces_published_menu(client, admin_headers):
    rid = create_restaurant(client, admin_headers)
    first = upload(client, admin_headers, rid, sample_menus.sample_csv(), "menu.csv").json()["id"]
    client.post(
        f"{API}/restaurants/{rid}/menu/imports/{first}/approve",
        json={"mode": "replace"},
        headers=admin_headers,
    )

    duplicate = upload(client, admin_headers, rid, sample_menus.sample_csv(), "menu.csv")
    assert duplicate.json()["error"]["code"] == "DUPLICATE_IMPORT"

    second = upload(client, admin_headers, rid, sample_menus.sample_xlsx(), "menu.xlsx").json()["id"]
    needs_confirm = client.post(
        f"{API}/restaurants/{rid}/menu/imports/{second}/approve",
        json={"mode": "replace"},
        headers=admin_headers,
    )
    assert needs_confirm.json()["error"]["code"] == "CONFIRM_REPLACE_REQUIRED"

    merged = client.post(
        f"{API}/restaurants/{rid}/menu/imports/{second}/approve",
        json={"mode": "merge"},
        headers=admin_headers,
    ).json()
    assert merged["stats"]["updated"] == len(sample_menus.SAMPLE_ROWS)
    assert merged["stats"]["created"] == 0
    history = client.get(f"{API}/restaurants/{rid}/menu/imports", headers=admin_headers).json()
    assert [h["status"] for h in history] == ["APPROVED", "APPROVED"]


def test_reject_import(client, admin_headers):
    rid = create_restaurant(client, admin_headers)
    import_id = upload(client, admin_headers, rid, sample_menus.sample_csv(), "menu.csv").json()["id"]
    rejected = client.post(f"{API}/restaurants/{rid}/menu/imports/{import_id}/reject", headers=admin_headers)
    assert rejected.json()["status"] == "REJECTED"
    # A rejected file may be uploaded again.
    assert upload(client, admin_headers, rid, sample_menus.sample_csv(), "menu.csv").status_code == 202


def test_invalid_upload_rejected(client, admin_headers):
    rid = create_restaurant(client, admin_headers)
    response = upload(client, admin_headers, rid, b"\x7fELF binary", "menu.bin")
    assert response.json()["error"]["code"] == "UNSUPPORTED_FILE_TYPE"


@pytest.mark.skipif(HAS_TESSERACT, reason="Checks the behaviour when Tesseract is missing")
def test_image_import_reports_missing_ocr_clearly(client, admin_headers):
    rid = create_restaurant(client, admin_headers)
    import_id = upload(client, admin_headers, rid, sample_menus.sample_png(), "menu.png").json()["id"]
    detail = client.get(f"{API}/restaurants/{rid}/menu/imports/{import_id}", headers=admin_headers).json()
    assert detail["status"] == "FAILED"
    assert "Tesseract" in detail["error_message"]
    assert detail["warnings"][-1]["code"] == "OCR_UNAVAILABLE"


@pytest.mark.ocr
@pytest.mark.skipif(not HAS_TESSERACT, reason="Tesseract OCR is not installed (run inside Docker)")
def test_image_import_with_ocr(client, admin_headers):
    rid = create_restaurant(client, admin_headers)
    import_id = upload(client, admin_headers, rid, sample_menus.sample_png(), "menu.png").json()["id"]
    detail = client.get(f"{API}/restaurants/{rid}/menu/imports/{import_id}", headers=admin_headers).json()
    assert detail["status"] == "NEEDS_REVIEW", detail
    items = {i["name"].lower(): i for i in detail["extraction_result"]["items"]}
    assert "chicken burger" in items
    assert items["chicken burger"]["base_price"] == "180.00"
    assert any(w["code"] == "OCR_USED" for w in detail["warnings"])
