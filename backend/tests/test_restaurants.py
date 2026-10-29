import io

from PIL import Image

from tests.conftest import login, make_user

API = "/api/v1"


def create_restaurant(client, headers, **overrides):
    payload = {
        "name": "Nile Burger",
        "branch": "Maadi",
        "cuisine": "Burgers",
        "phone": "0100",
        "address": "Road 9",
        "description": "Burgers and fries",
        **overrides,
    }
    return client.post(f"{API}/restaurants", json=payload, headers=headers)


def test_create_and_list_restaurants(client, admin_headers):
    created = create_restaurant(client, admin_headers)
    assert created.status_code == 201
    assert created.json()["source_provider"] == "MANUAL"
    listed = client.get(f"{API}/restaurants", headers=admin_headers).json()
    assert listed["total"] == 1
    assert listed["items"][0]["item_count"] == 0


def test_duplicate_restaurant_detection(client, admin_headers):
    create_restaurant(client, admin_headers)
    dup = create_restaurant(client, admin_headers, name="nile  burger")
    assert dup.status_code == 409
    assert dup.json()["error"]["code"] == "DUPLICATE_RESTAURANT"
    other_branch = create_restaurant(client, admin_headers, branch="Zamalek")
    assert other_branch.status_code == 201
    forced = create_restaurant(client, admin_headers, name="Nile Burger", allow_duplicate=True)
    assert forced.status_code == 201


def test_external_reference_must_be_url(client, admin_headers):
    bad = create_restaurant(client, admin_headers, external_reference="javascript:alert(1)")
    assert bad.status_code == 422


def test_menu_management_flow(client, admin_headers):
    rid = create_restaurant(client, admin_headers).json()["id"]
    cat = client.post(
        f"{API}/restaurants/{rid}/categories", json={"name": "Burgers"}, headers=admin_headers
    ).json()
    dup_cat = client.post(
        f"{API}/restaurants/{rid}/categories", json={"name": "burgers"}, headers=admin_headers
    )
    assert dup_cat.json()["error"]["code"] == "CATEGORY_EXISTS"

    item = client.post(
        f"{API}/restaurants/{rid}/items",
        json={
            "category_id": cat["id"],
            "name": "Chicken Burger",
            "base_price": "180.00",
            "modifier_groups": [
                {
                    "name": "Size",
                    "is_required": True,
                    "maximum_selections": 1,
                    "modifiers": [
                        {"name": "Regular", "additional_price": "0"},
                        {"name": "Large", "additional_price": "35"},
                    ],
                },
            ],
        },
        headers=admin_headers,
    )
    assert item.status_code == 201, item.text
    body = item.json()
    assert body["base_price"] == "180.00"
    assert body["modifier_groups"][0]["minimum_selections"] == 1
    item_id = body["id"]

    extras = client.post(
        f"{API}/items/{item_id}/modifier-groups",
        json={
            "name": "Extras",
            "maximum_selections": 2,
            "modifiers": [{"name": "Cheese", "additional_price": "20"}],
        },
        headers=admin_headers,
    ).json()
    group_id = extras["modifier_groups"][1]["id"]
    with_sauce = client.post(
        f"{API}/modifier-groups/{group_id}/modifiers",
        json={"name": "Sauce", "additional_price": "10"},
        headers=admin_headers,
    ).json()
    sauce_id = with_sauce["modifier_groups"][1]["modifiers"][1]["id"]
    repriced = client.patch(
        f"{API}/modifiers/{sauce_id}", json={"additional_price": "12.50"}, headers=admin_headers
    ).json()
    assert repriced["modifier_groups"][1]["modifiers"][1]["additional_price"] == "12.50"

    updated = client.patch(
        f"{API}/items/{item_id}", json={"base_price": "190", "is_available": False}, headers=admin_headers
    ).json()
    assert updated["base_price"] == "190.00" and updated["is_available"] is False

    menu = client.get(f"{API}/restaurants/{rid}/menu", headers=admin_headers).json()
    assert menu["item_count"] == 1
    assert menu["categories"][0]["items"][0]["name"] == "Chicken Burger"

    assert (
        client.delete(f"{API}/categories/{cat['id']}", headers=admin_headers).json()["error"]["code"]
        == "CATEGORY_NOT_EMPTY"
    )
    assert client.delete(f"{API}/items/{item_id}", headers=admin_headers).status_code == 204
    assert client.get(f"{API}/restaurants/{rid}/menu", headers=admin_headers).json()["item_count"] == 0


def test_invalid_modifier_group_rules(client, admin_headers):
    rid = create_restaurant(client, admin_headers).json()["id"]
    cat = client.post(f"{API}/restaurants/{rid}/categories", json={"name": "X"}, headers=admin_headers).json()
    bad = client.post(
        f"{API}/restaurants/{rid}/items",
        json={
            "category_id": cat["id"],
            "name": "Thing",
            "base_price": "10",
            "modifier_groups": [{"name": "Pick", "minimum_selections": 3, "maximum_selections": 1}],
        },
        headers=admin_headers,
    )
    assert bad.status_code == 422
    too_many_required = client.post(
        f"{API}/restaurants/{rid}/items",
        json={
            "category_id": cat["id"],
            "name": "Thing",
            "base_price": "10",
            "modifier_groups": [
                {
                    "name": "Pick",
                    "minimum_selections": 2,
                    "maximum_selections": 2,
                    "modifiers": [{"name": "Only one", "additional_price": "0"}],
                }
            ],
        },
        headers=admin_headers,
    )
    assert too_many_required.json()["error"]["code"] == "INVALID_MODIFIER_GROUP"


def test_negative_or_fractional_cent_prices_rejected(client, admin_headers):
    rid = create_restaurant(client, admin_headers).json()["id"]
    cat = client.post(f"{API}/restaurants/{rid}/categories", json={"name": "X"}, headers=admin_headers).json()
    for price in ("-1", "10.555"):
        response = client.post(
            f"{API}/restaurants/{rid}/items",
            json={"category_id": cat["id"], "name": "Thing", "base_price": price},
            headers=admin_headers,
        )
        assert response.status_code == 422, price


def test_image_upload_validates_content(client, admin_headers):
    buffer = io.BytesIO()
    Image.new("RGB", (40, 30), (24, 90, 219)).save(buffer, "PNG")
    ok = client.post(
        f"{API}/uploads/images",
        files={"file": ("logo.png", buffer.getvalue(), "image/png")},
        headers=admin_headers,
    )
    assert ok.status_code == 201
    url = ok.json()["url"]
    assert url.startswith("/media/images/")
    assert client.get(url).status_code == 200

    fake = client.post(
        f"{API}/uploads/images",
        files={"file": ("x.png", b"<script>alert(1)</script>", "image/png")},
        headers=admin_headers,
    )
    assert fake.json()["error"]["code"] == "INVALID_IMAGE"


def test_employee_cannot_browse_restaurants_directly(client, db, admin_headers):
    rid = create_restaurant(client, admin_headers).json()["id"]
    make_user(db, "sara")
    headers = login(client, "sara")
    assert client.get(f"{API}/restaurants/{rid}/menu", headers=headers).status_code == 403
    assert client.get(f"{API}/sessions/today/menu", headers=headers).json()["error"]["code"] == "NO_SESSION"


def test_providers_status(client, admin_headers):
    providers = {p["key"]: p for p in client.get(f"{API}/admin/providers", headers=admin_headers).json()}
    assert providers["manual"]["enabled"] is True
    assert providers["file_import"]["enabled"] is True
    assert providers["talabat"]["enabled"] is False
    assert "authorization" in providers["talabat"]["message"].lower()
