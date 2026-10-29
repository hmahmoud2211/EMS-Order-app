from app.models.enums import UserRole
from tests.conftest import login, make_user

API = "/api/v1"


def test_create_employee_with_generated_password(client, admin_headers):
    response = client.post(
        f"{API}/employees",
        json={"full_name": "  Sara   Nabil ", "username": "Sara.Nabil", "department": "Finance"},
        headers=admin_headers,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["employee"]["full_name"] == "Sara Nabil"
    assert body["employee"]["username"] == "sara.nabil"
    assert body["employee"]["must_change_password"] is True
    assert body["employee"]["participates_in_orders"] is True
    temp = body["temporary_password"]
    assert temp and len(temp) >= 10
    me = client.get(f"{API}/auth/me", headers=login(client, "sara.nabil", temp))
    assert me.json()["must_change_password"] is True


def test_duplicate_username_and_email_rejected(client, admin_headers, db):
    make_user(db, "omar", email="omar@example.com")
    dup = client.post(
        f"{API}/employees", json={"full_name": "Omar Two", "username": "omar"}, headers=admin_headers
    )
    assert dup.status_code == 409
    assert dup.json()["error"]["code"] == "USERNAME_TAKEN"
    dup_email = client.post(
        f"{API}/employees",
        json={"full_name": "Omar Two", "username": "omar2", "email": "OMAR@example.com"},
        headers=admin_headers,
    )
    assert dup_email.json()["error"]["code"] == "EMAIL_TAKEN"


def test_invalid_username_is_validation_error(client, admin_headers):
    response = client.post(
        f"{API}/employees", json={"full_name": "X Y", "username": "a b"}, headers=admin_headers
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_update_deactivate_and_reactivate(client, admin_headers, db, admin):
    employee = make_user(db, "sara")
    headers = login(client, "sara")
    updated = client.patch(
        f"{API}/employees/{employee.id}", json={"department": "IT", "phone": "0100"}, headers=admin_headers
    )
    assert updated.json()["department"] == "IT"

    off = client.post(f"{API}/employees/{employee.id}/deactivate", headers=admin_headers)
    assert off.json()["is_active"] is False
    assert client.get(f"{API}/auth/me", headers=headers).status_code == 401
    on = client.post(f"{API}/employees/{employee.id}/reactivate", headers=admin_headers)
    assert on.json()["is_active"] is True

    self_off = client.post(f"{API}/employees/{admin.id}/deactivate", headers=admin_headers)
    assert self_off.json()["error"]["code"] == "CANNOT_DEACTIVATE_SELF"


def test_last_admin_cannot_be_demoted(client, admin_headers, admin):
    response = client.patch(f"{API}/employees/{admin.id}", json={"role": "EMPLOYEE"}, headers=admin_headers)
    assert response.json()["error"]["code"] == "LAST_ADMIN"


def test_search_and_filter(client, admin_headers, db):
    make_user(db, "sara.nabil", full_name="Sara Nabil")
    make_user(db, "omar.adel", full_name="Omar Adel", is_active=False)
    found = client.get(f"{API}/employees", params={"q": "sara"}, headers=admin_headers).json()
    assert [e["username"] for e in found["items"]] == ["sara.nabil"]
    inactive = client.get(f"{API}/employees", params={"status": "inactive"}, headers=admin_headers).json()
    assert [e["username"] for e in inactive["items"]] == ["omar.adel"]
    admins = client.get(f"{API}/employees", params={"role": "ADMIN"}, headers=admin_headers).json()
    assert all(e["role"] == "ADMIN" for e in admins["items"])


def test_csv_import_preview_then_commit(client, admin_headers, db):
    make_user(db, "existing.user")
    csv_data = (
        b"Full Name,Username,Email,Department\n"
        b"Mona Samir,,mona@example.com,HR\n"
        b"Karim Adel,karim.adel,,IT\n"
        b"Bad Row,existing.user,,IT\n"
        b",nobody,,IT\n"
    )
    preview = client.post(
        f"{API}/employees/import",
        files={"file": ("staff.csv", csv_data, "text/csv")},
        data={"dry_run": "true"},
        headers=admin_headers,
    ).json()
    assert preview["dry_run"] is True
    assert preview["total_rows"] == 4
    assert preview["valid_rows"] == 2
    assert preview["rows"][0]["username"] == "mona.samir"
    assert any("already exists" in e for e in preview["rows"][2]["errors"])
    assert preview["created"] == []

    committed = client.post(
        f"{API}/employees/import",
        files={"file": ("staff.csv", csv_data, "text/csv")},
        data={"dry_run": "false"},
        headers=admin_headers,
    ).json()
    assert [c["username"] for c in committed["created"]] == ["mona.samir", "karim.adel"]
    assert login(client, "karim.adel", committed["created"][1]["temporary_password"])


def test_admin_can_create_other_admin_not_participating(client, admin_headers):
    response = client.post(
        f"{API}/employees",
        json={"full_name": "Second Admin", "username": "admin2", "role": UserRole.ADMIN},
        headers=admin_headers,
    )
    assert response.json()["employee"]["participates_in_orders"] is False
