# Feature checklist

Legend: ✅ implemented and verified by automated tests and/or a live run · 🟡 implemented, needs external accounts/infrastructure to verify end-to-end · ⛔ intentionally not implemented (reason given)

## Platform & foundation
- ✅ FastAPI backend, service + repository architecture, `/api/v1`, consistent error envelope, structured logging, request ids
- ✅ PostgreSQL schema via Alembic (constraints, partial unique indexes, audit tables)
- ✅ Expo SDK 58 app (TypeScript, Expo Router, NativeWind, TanStack Query, Zustand, RHF + Zod, Axios, SecureStore, Reanimated, Lucide)
- ✅ Same app runs in the browser (Expo Web) for the admin, including a wide editable import-review table
- ✅ Docker Compose (db, api, worker, caddy), Dockerfile with Tesseract eng+ara, `.env.example`
- 🟡 HTTPS on a public domain (Caddy config ready; needs a VPS + DNS record)
- 🟡 EAS Android/iOS builds (`eas.json` ready; needs Expo account, Firebase for Android push, Apple Developer account for iOS)

## Authentication & users
- ✅ Login by username or email, Argon2, rotating refresh tokens with reuse detection, logout
- ✅ Account lockout + rate limiting, deactivated accounts rejected on every request
- ✅ First-admin CLI (`create-admin`), no default credentials, no self-registration
- ✅ Temporary passwords forcing a change at first sign-in
- ✅ Password reset without paid email (admin-issued one-time code) + optional SMTP
- ✅ Employee CRUD, deactivate/reactivate (sessions revoked), search, CSV import with preview, order history
- ✅ Roles enforced server-side; horizontal access to other employees' orders blocked

## Restaurants & menus
- ✅ Restaurant directory (name, branch, cuisine, description, photo, logo, phone, address, authorized external link, active)
- ✅ Duplicate restaurant warning
- ✅ Categories, items, sizes/options/extras (required/optional, min/max), availability, archive instead of delete
- ✅ Image uploads (validated and re-encoded)
- ✅ Provider interface: Manual, File import, Authorized Talabat (disabled; config-gated; no invented endpoints)

## Free menu import engine
- ✅ PDF text extraction with layout (columns, headings, descriptions, sizes, extras)
- ✅ CSV and Excel import with fuzzy English/Arabic headers
- ✅ OCR pipeline for images and scanned PDFs (OpenCV preprocessing + Tesseract) — tested in the Docker image
- ✅ Clear `OCR_UNAVAILABLE` / `ARABIC_OCR_UNAVAILABLE` warnings instead of fake results
- ✅ Confidence scores, validation status, duplicate hints, unparsed-line report, never-guessed prices
- ✅ Review/edit/add/delete/merge, publish with explicit replace (double confirmation) or merge, reject, full history, duplicate-file detection

## Daily sessions
- ✅ One active session per date (DB constraint), one restaurant per session
- ✅ DRAFT → OPEN ⇄ CLOSED → FINALIZED, CANCELLED; scheduled opening; extend deadline & reopen
- ✅ Changing restaurant with existing orders requires explicit, audited cancellation
- ✅ Finalized sessions locked; audited admin override
- ✅ Africa/Cairo business dates, UTC storage, server-side deadline enforcement, automatic close by the worker

## Employee app
- ✅ Branded login with remembered session, password visibility, validation, errors, loading
- ✅ Home: greeting, date, restaurant of the day, deadline countdown, order status, empty state
- ✅ Menu: cover, category chips, search, cards, availability, sticky cart bar
- ✅ Item details: options (required/optional), extras, quantity, special instructions, live total
- ✅ Cart: edit/remove/quantities, totals, sticky submit, price-change and unavailable-item handling
- ✅ Confirmation (worded as an internal EMS submission), My Order (edit/cancel when allowed), History, Profile (password, notification preferences, language, sign-out)

## Admin
- ✅ Live dashboard (5 s polling while visible): restaurant, status, employees, ordered, not ordered, meals, total value, countdown, progress bar, who's missing
- ✅ Employee status list with All / Ordered / Not ordered filters and search
- ✅ Order details, audited modify/cancel, record an order for an employee, revision history
- ✅ Consolidated order by employee and by item configuration (with instructions), admin-entered fees (none / equal / proportional split)
- ✅ Exports: PDF (EMS branding, Arabic-capable font), Excel, CSV, copyable text, native share sheet / browser download
- ✅ Session management, session history, spending & participation analytics, company settings, provider & OCR status

## Notifications
- ✅ In-app notification center with unread badge
- ✅ Events: restaurant selected, ordering opened, deadline approaching, order submitted/modified/cancelled, session closed/cancelled/finalized, password reset requested
- ✅ De-duplication (unique dedupe keys), per-user preferences, token registration per device, dead-token cleanup, push after commit
- 🟡 Actual device push delivery (requires EAS project id + FCM/APNs credentials and a development/production build)

## Quality
- ✅ Backend: 102 pytest tests (101 run locally + 1 OCR test run in Docker), including the full spec §24 acceptance scenario; ruff lint + format clean
- ✅ Mobile: 30 Jest/RNTL tests (login, navigation guard, home, menu, item customization, cart & price change, dashboard, status filter, restaurant selection, money/time/modifier/cart logic); `tsc` clean; `expo lint` clean; `expo-doctor` 20/20
- ✅ Live UI run in Chrome (web build) for employee and admin flows
- ✅ i18n: English + Arabic strings, RTL switching

## Not included (by design)
- ⛔ Placing orders with restaurants/Talabat or taking payments — out of scope per the brief; the app produces the consolidated order for the admin to place.
- ⛔ Unauthorized scraping of Talabat or other platforms.
