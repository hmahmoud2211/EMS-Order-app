from app.models.enums import UserRole
from tests.conftest import PASSWORD, login, make_user

API = "/api/v1"


def test_login_success_returns_tokens_and_user(client, db):
    make_user(db, "sara.nabil")
    response = client.post(f"{API}/auth/login", json={"username": "Sara.Nabil", "password": PASSWORD})
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"] and body["refresh_token"]
    assert body["user"]["username"] == "sara.nabil"
    assert body["user"]["role"] == "EMPLOYEE"
    assert "password_hash" not in body["user"]


def test_login_by_email(client, db):
    make_user(db, "omar", email="omar@example.com")
    response = client.post(f"{API}/auth/login", json={"username": "OMAR@example.com", "password": PASSWORD})
    assert response.status_code == 200


def test_login_wrong_password_and_unknown_user_look_the_same(client, db):
    make_user(db, "sara")
    wrong = client.post(f"{API}/auth/login", json={"username": "sara", "password": "nope12345"})
    unknown = client.post(f"{API}/auth/login", json={"username": "ghost", "password": "nope12345"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["error"]["code"] == unknown.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_account_locks_after_repeated_failures(client, db):
    make_user(db, "sara")
    for _ in range(5):
        client.post(f"{API}/auth/login", json={"username": "sara", "password": "wrong-pass1"})
    response = client.post(f"{API}/auth/login", json={"username": "sara", "password": PASSWORD})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "ACCOUNT_LOCKED"


def test_disabled_account_cannot_login_or_use_tokens(client, db):
    user = make_user(db, "sara")
    headers = login(client, "sara")
    user.is_active = False
    db.commit()
    assert client.get(f"{API}/auth/me", headers=headers).json()["error"]["code"] == "ACCOUNT_DISABLED"
    response = client.post(f"{API}/auth/login", json={"username": "sara", "password": PASSWORD})
    assert response.json()["error"]["code"] == "ACCOUNT_DISABLED"


def test_refresh_rotates_and_detects_reuse(client, db):
    make_user(db, "sara")
    tokens = client.post(f"{API}/auth/login", json={"username": "sara", "password": PASSWORD}).json()
    first = client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert first.status_code == 200
    rotated = first.json()["refresh_token"]
    assert rotated != tokens["refresh_token"]

    reuse = client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert reuse.status_code == 401
    assert reuse.json()["error"]["code"] == "TOKEN_REUSED"
    # The whole family is revoked after reuse, including the newest token.
    assert client.post(f"{API}/auth/refresh", json={"refresh_token": rotated}).status_code == 401


def test_logout_revokes_refresh_token(client, db):
    make_user(db, "sara")
    tokens = client.post(f"{API}/auth/login", json={"username": "sara", "password": PASSWORD}).json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert (
        client.post(
            f"{API}/auth/logout", json={"refresh_token": tokens["refresh_token"]}, headers=headers
        ).status_code
        == 204
    )
    assert (
        client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401
    )


def test_invalid_and_missing_tokens(client):
    assert client.get(f"{API}/auth/me").json()["error"]["code"] == "NOT_AUTHENTICATED"
    bad = client.get(f"{API}/auth/me", headers={"Authorization": "Bearer abc.def.ghi"})
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "INVALID_TOKEN"


def test_must_change_password_blocks_other_endpoints(client, db):
    make_user(db, "sara", must_change_password=True)
    headers = login(client, "sara")
    assert client.get(f"{API}/auth/me", headers=headers).status_code == 200
    blocked = client.get(f"{API}/sessions/today", headers=headers)
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"

    changed = client.post(
        f"{API}/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "BrandNew123"},
        headers=headers,
    )
    assert changed.status_code == 200
    new_headers = {"Authorization": f"Bearer {changed.json()['access_token']}"}
    assert client.get(f"{API}/sessions/today", headers=new_headers).status_code == 200


def test_change_password_validation(client, db):
    make_user(db, "sara")
    headers = login(client, "sara")
    wrong = client.post(
        f"{API}/auth/change-password",
        json={"current_password": "nope12345", "new_password": "BrandNew123"},
        headers=headers,
    )
    assert wrong.json()["error"]["code"] == "INVALID_CURRENT_PASSWORD"
    weak = client.post(
        f"{API}/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "onlyletters"},
        headers=headers,
    )
    assert weak.json()["error"]["code"] == "WEAK_PASSWORD"


def test_password_reset_with_admin_issued_code(client, db, admin_headers):
    employee = make_user(db, "sara")
    # Request is accepted without revealing whether the account exists, and admins are notified.
    assert client.post(f"{API}/auth/request-password-reset", json={"username": "ghost"}).status_code == 202
    assert client.post(f"{API}/auth/request-password-reset", json={"username": "sara"}).status_code == 202
    notes = client.get(f"{API}/notifications", headers=admin_headers).json()
    assert any(n["type"] == "PASSWORD_RESET_REQUESTED" for n in notes["items"])

    issued = client.post(
        f"{API}/employees/{employee.id}/reset-password", json={"method": "code"}, headers=admin_headers
    ).json()
    bad = client.post(
        f"{API}/auth/reset-password",
        json={"username": "sara", "code": "WRONG123", "new_password": "Another123"},
    )
    assert bad.json()["error"]["code"] == "INVALID_RESET_CODE"
    ok = client.post(
        f"{API}/auth/reset-password",
        json={"username": "sara", "code": issued["secret"], "new_password": "Another123"},
    )
    assert ok.status_code == 200, ok.text
    assert login(client, "sara", "Another123")
    # A code works only once.
    again = client.post(
        f"{API}/auth/reset-password",
        json={"username": "sara", "code": issued["secret"], "new_password": "Another456"},
    )
    assert again.status_code == 422


def test_employees_cannot_reach_admin_endpoints(client, db):
    make_user(db, "sara")
    headers = login(client, "sara")
    for method, path in [
        ("get", "/employees"),
        ("get", "/restaurants"),
        ("get", "/admin/dashboard"),
        ("post", "/sessions"),
        ("get", "/sessions/history"),
        ("get", "/admin/settings"),
    ]:
        response = getattr(client, method)(
            f"{API}{path}", headers=headers, **({"json": {}} if method == "post" else {})
        )
        assert response.status_code == 403, path
        assert response.json()["error"]["code"] == "ADMIN_REQUIRED"


def test_admin_role_is_enforced_server_side(client, db):
    make_user(db, "boss", UserRole.ADMIN)
    headers = login(client, "boss")
    assert client.get(f"{API}/employees", headers=headers).status_code == 200
