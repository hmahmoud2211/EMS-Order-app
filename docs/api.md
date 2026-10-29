# API reference

Base path: `/api/v1`. Interactive OpenAPI docs are served at `/docs` in development (`/api/v1/openapi.json` always).

- **Auth:** `Authorization: Bearer <access token>` (15 min). Refresh with `POST /auth/refresh` (rotating refresh tokens).
- **Money:** decimal strings, e.g. `"180.00"` (EGP). **Times:** ISO-8601 UTC. **Dates:** `YYYY-MM-DD` business date (Africa/Cairo).
- **Errors:** `{"error": {"code": "...", "message": "...", "details": ...}}` with HTTP 401/403/404/409/422/429/503.
- **Pagination:** `?limit=&offset=` → `{"items", "total", "limit", "offset"}`.

## Authentication

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | public | `{username, password}` (username or email). Rate limited; 5 failures lock 5 min. |
| POST | `/auth/refresh` | public | `{refresh_token}` → new pair; reusing an old token revokes the session family (`TOKEN_REUSED`). |
| POST | `/auth/logout` | user | `{refresh_token, push_token?}` |
| GET | `/auth/me` | user | Current account |
| POST | `/auth/change-password` | user | Required first when `must_change_password` (other endpoints return `PASSWORD_CHANGE_REQUIRED`) |
| POST | `/auth/request-password-reset` | public | Always 202. Notifies admins (or emails a code if SMTP is configured). |
| POST | `/auth/reset-password` | public | `{username, code, new_password}` with an admin-issued one-time code |

## Employees (admin)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/employees?q=&status=active\|inactive\|all&role=` | Search |
| POST | `/employees` | Returns `temporary_password` once if no password given |
| GET/PATCH | `/employees/{id}` | |
| POST | `/employees/{id}/deactivate`, `/reactivate` | Deactivation revokes sessions; can't deactivate yourself or the last admin |
| POST | `/employees/{id}/reset-password` | `{method: "code" \| "temporary_password"}` |
| POST | `/employees/import` | multipart `file` (CSV) + `dry_run` (default true) |
| GET | `/employees/{id}/orders` | Order history |

## Restaurants & menus (admin)

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/restaurants` | Create warns about near-duplicates (`DUPLICATE_RESTAURANT`, pass `allow_duplicate`) |
| GET/PATCH | `/restaurants/{id}` | |
| GET | `/restaurants/{id}/menu` | Categories → items → modifier groups → modifiers |
| POST | `/restaurants/{id}/categories` · PATCH/DELETE `/categories/{id}` | Delete archives (`?archive_items=true` if not empty) |
| POST | `/restaurants/{id}/items` · GET/PATCH/DELETE `/items/{id}` | Delete archives |
| POST | `/items/{id}/modifier-groups` · PATCH/DELETE `/modifier-groups/{id}` | |
| POST | `/modifier-groups/{id}/modifiers` · PATCH/DELETE `/modifiers/{id}` | |
| POST | `/uploads/images?kind=` | JPG/PNG/WEBP ≤ 8 MB → `{url}` |
| POST | `/restaurants/{id}/menu/import` | multipart `file` (PDF/JPG/PNG/WEBP/CSV/XLSX ≤ 20 MB), `force` → 202, extraction runs in background |
| GET | `/restaurants/{id}/menu/imports` | Import history |
| GET/PATCH | `/restaurants/{id}/menu/imports/{importId}` | Read / save edited draft `{items: [...]}` |
| POST | `/restaurants/{id}/menu/imports/{importId}/approve` | `{mode: "replace"\|"merge", confirm_replace}` |
| POST | `/restaurants/{id}/menu/imports/{importId}/reject` | |
| POST | `/restaurants/{id}/menu/refresh` | Provider sync — only for an authorized, configured Talabat partnership |

## Daily sessions

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/sessions/today` | user | Today's visible session, `is_accepting_orders`, `accepting_reason`, `my_order`, server time |
| GET | `/sessions/today/menu` | user | Menu of today's restaurant only |
| POST | `/sessions` | admin | `{restaurant_id, session_date?, opens_at?, closes_at, notes?, open_now}` |
| GET | `/sessions/history` | admin | With stats |
| GET/PATCH | `/sessions/{id}` | admin | PATCH: deadline, fees, notes, restaurant (`existing_orders_action: "cancel"` required if orders exist), `admin_override` + `reason` for finalized sessions |
| POST | `/sessions/{id}/open` · `/close` · `/finalize` · `/cancel` | admin | `open` accepts `{closes_at}` to extend & reopen; `cancel` requires `{reason}` |

## Employee orders

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/orders/me/today` · `/orders/me/history` · `/orders/me/{id}` | Own orders only |
| POST | `/orders` | `{session_id, items: [{menu_item_id, quantity, modifier_ids, special_instructions}], expected_total}` + optional `Idempotency-Key` header |
| PUT | `/orders/{id}` | Replace items before the deadline |
| DELETE | `/orders/{id}` | Cancel (if allowed by settings, before the deadline) |

Typical rejections: `SESSION_CLOSED`, `DEADLINE_PASSED`, `ORDERING_NOT_STARTED`, `ORDER_EXISTS`, `ITEM_NOT_IN_MENU`, `ITEM_UNAVAILABLE`, `MODIFIER_SELECTION_INVALID`, `PRICE_CHANGED` (details include recalculated lines), `NOT_A_PARTICIPANT`.

## Admin

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/dashboard` | Today's session, metrics, recent orders, who hasn't ordered, seconds until close |
| GET | `/admin/sessions/{id}/orders?include_cancelled=` | |
| GET | `/admin/sessions/{id}/employee-status?filter=all\|ordered\|not_ordered&q=` | |
| GET | `/admin/sessions/{id}/summary` | Session + stats |
| GET | `/admin/sessions/{id}/consolidated` | By employee and by item configuration, fees, totals |
| GET | `/admin/sessions/{id}/export?format=pdf\|xlsx\|csv\|txt` | File download |
| POST | `/admin/sessions/{id}/orders` | Record an order for an employee (`reason` required) |
| GET/PATCH | `/admin/orders/{id}` · POST `/admin/orders/{id}/cancel` · GET `/admin/orders/{id}/revisions` | Corrections are audited |
| GET | `/admin/analytics/spending` · `/admin/analytics/participation` | `?date_from&date_to` (default last 30 days) |
| GET/PATCH | `/admin/settings` | Company ordering rules |
| GET | `/admin/providers` · `/admin/ocr-status` · `/admin/audit-logs` | |

## Notifications

| Method | Path |
| --- | --- |
| GET | `/notifications?unread_only=` |
| PATCH | `/notifications/{id}/read` · `/notifications/read-all` |
| POST | `/notifications/register-device` `{token, platform, device_name}` · `/notifications/unregister-device` |
| GET/PATCH | `/notifications/preferences` |

`GET /health` reports API, database and OCR availability.
