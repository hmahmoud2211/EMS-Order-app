# Architecture

```
 iOS / Android app ─┐                                   ┌─ PostgreSQL 17
 Admin in browser ──┼── HTTPS ──▶ Caddy ──▶ FastAPI ────┤
 (Expo Web build)   ┘           (TLS, /api, /media,     ├─ /media volume (uploaded images, private import files)
                                 static admin app)      └─ Expo Push Service (free) ◀── scheduler worker
```

| Process | Responsibility |
| --- | --- |
| `api` (FastAPI, uvicorn) | REST API under `/api/v1`, validation, business rules, exports, background menu extraction |
| `worker` (`python -m app.workers.scheduler`) | Every minute: auto-close sessions past their deadline, "ordering opened" notifications for scheduled sessions, deadline reminders; every 15 min: push receipt checks; every 6 h: cleanup. A PostgreSQL advisory lock guarantees a single active scheduler. |
| `db` | PostgreSQL — all persistent state |
| `caddy` | Automatic HTTPS (Let's Encrypt), reverse proxy, serves the Expo Web admin build |

## Backend layout (`backend/app`)

| Package | Contents |
| --- | --- |
| `api/` | `deps.py` (auth, roles, pagination, clock), `v1/routers/*` — thin HTTP layer |
| `services/` | Business logic and transactions: auth, employees, restaurants, menu, sessions, pricing, orders, reports, exports, notifications, push, audit, settings, uploads |
| `services/menu_import/` | Free extraction engine: detect → extract (PDF/OCR/tabular) → layout → parse → score → review → publish |
| `repositories/` | Shared queries (users, sessions, orders) |
| `integrations/restaurant_providers/` | `RestaurantProvider` protocol + `ManualMenuProvider`, `FileImportMenuProvider`, `AuthorizedTalabatProvider` |
| `models/` | SQLAlchemy 2 models; `schemas/` Pydantic v2 request/response models |
| `core/` | config, security (Argon2, JWT), errors, logging (structlog), rate limiting, business clock |
| `workers/` | scheduler + idempotent jobs |
| `cli.py` | `create-admin`, `seed-dev`, `generate-import-fixtures` |

Every error response uses one envelope: `{"error": {"code": "SESSION_CLOSED", "message": "…", "details": …}}`. The mobile app maps codes to translated messages.

## Mobile layout (`apps/mobile`)

| Folder | Contents |
| --- | --- |
| `app/` | Expo Router routes. `(auth)`, `(employee)` tabs (Home · My Order · History · Profile), `(admin)/(tabs)` (Dashboard · Orders · Restaurants · Employees · Settings) + admin stack screens, `(ordering)` (menu → item → cart → confirmation, shared by everyone who orders lunch) |
| `components/` | Design system (`ui/`), brand, navigation |
| `features/` | Feature modules: API hooks (TanStack Query), feature components, schemas |
| `services/` | Axios client with single-flight token refresh, token storage (SecureStore on native, localStorage on web), push, exports, query client |
| `stores/` | Zustand: auth session, persisted cart (with idempotency key) |
| `i18n/` | English + Arabic, RTL support |
| `utils/` | Money in integer piastres, Cairo time, modifier rules, errors |

Role-based navigation uses `Stack.Protected` guards; the API independently enforces every permission.

## Core business rules and where they are enforced

| Rule | Enforcement |
| --- | --- |
| One active session per company date | Partial unique index `uq_daily_sessions_active_date` (`status <> 'CANCELLED'`) + service check |
| One restaurant per session; employees can't choose it | `orders` never accept a restaurant id; items are validated against the session's restaurant (`pricing_service`) |
| One active order per employee per session | Partial unique index `uq_orders_active_employee_session` + `ORDER_EXISTS` |
| No submissions after the deadline / while closed | `session_service.ensure_accepting` on every submit/edit/cancel; the session row is locked (`SELECT … FOR UPDATE`) so closing and submitting serialize |
| Prices are server-authoritative | `pricing_service` re-prices from the database with `Decimal` + `ROUND_HALF_UP`; client sends `expected_total` → `PRICE_CHANGED` if it differs |
| Duplicate submissions from retries | `Idempotency-Key` header stored per user with the original response |
| Changing the restaurant after orders exist | `409 SESSION_HAS_ORDERS` unless the admin explicitly confirms cancelling them (audited, employees notified) |
| Finalized sessions are locked | Edits require `admin_override` + reason; logged as `SESSION_ADMIN_OVERRIDE` / `ORDER_ADMIN_OVERRIDE` |
| Historical accuracy | Order items store name/price/modifier snapshots; menu items are archived, never deleted |
| Business timezone | All timestamps stored in UTC; dates/deadlines computed in `Africa/Cairo` (DST-aware) |

## Security

- Argon2 password hashing; accounts lock for 5 minutes after 5 failed attempts; login/reset endpoints are rate limited.
- 15-minute access JWTs held in memory; opaque 256-bit refresh tokens stored hashed, rotated on every use, with reuse detection that revokes the whole token family.
- Deactivating an employee revokes all sessions immediately; every request re-checks `is_active`.
- Temporary passwords force a password change before any other endpoint can be used.
- Role checks (`require_admin`) on every admin endpoint; employees can only read/edit their own orders (others' orders return 404).
- Uploads: size limits, magic-byte detection, images re-encoded with Pillow; import source files are stored outside the public media folder.
- Secrets only via environment variables; the mobile app contains no secrets (only `EXPO_PUBLIC_API_URL`).
- Audit log for admin actions: employee changes, menu changes, session state changes, order corrections, overrides, imports, settings.
- Web admin: the refresh token is kept in `localStorage` because SecureStore is unavailable in browsers; the risk is reduced by short-lived access tokens, rotation and reuse detection. Serve the admin only over HTTPS (Caddy does this).

## Real-time dashboard

The admin dashboard and employee-status screens poll every 5 seconds while visible (TanStack Query `refetchInterval` tied to screen focus) and pause when hidden or backgrounded. For ~18 users this is cheap, works identically on iOS, Android and web, and needs no WebSocket/SSE infrastructure.

## Notifications

`notification_service.notify` inserts rows with `ON CONFLICT (dedupe_key) DO NOTHING`, so each event (e.g. "30 minutes left" for a specific deadline) is delivered at most once per user even if the worker restarts. Rows created inside a transaction are pushed only after it commits (SQLAlchemy `after_commit` hook → thread pool → Expo Push API). `DeviceNotRegistered` responses deactivate tokens. Users can opt out of announcement, reminder or order-update pushes; in-app notifications are always kept.
