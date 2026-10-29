# EMS Food

Internal daily lunch-ordering app for **Engineering Management Systems**. Each working day the administrator picks one restaurant; employees order from that restaurant only; the administrator watches who has and hasn't ordered in real time, then exports one consolidated order to place with the restaurant (by phone, Talabat, etc. — outside the app).

| Part | Stack |
| --- | --- |
| Mobile app (iOS, Android) + admin in the browser | Expo SDK 58, React Native 0.88, TypeScript, Expo Router, NativeWind, TanStack Query, Zustand, React Hook Form + Zod |
| API | FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, JWT (rotating refresh tokens), Argon2 |
| Database | PostgreSQL 17 |
| Menu import (free, open source) | PyMuPDF, Tesseract OCR (English + Arabic), OpenCV, pandas, openpyxl, rapidfuzz |
| Exports | ReportLab (PDF), openpyxl (Excel), CSV, plain text |
| Notifications | Expo Push Service (free) + in-app notification center |
| Deployment | Docker Compose: PostgreSQL + API + scheduler worker + Caddy (automatic HTTPS) |

No paid APIs are required. Talabat is **not** needed — see [docs/restaurant-imports.md](docs/restaurant-imports.md).

```
ems-food/                     (this repository)
├── apps/mobile/              Expo app (employee + admin, iOS/Android/web)
├── backend/                  FastAPI service, Alembic migrations, tests, Dockerfile
├── deploy/Caddyfile          HTTPS reverse proxy + static admin web app
├── docs/                     architecture, database, API, imports, deployment, checklist
├── docker-compose.yml
└── .env.example
```

## Quick start (development)

Prerequisites: Python 3.12, Node 22+ (24 recommended), PostgreSQL 14+ running locally. Tesseract is optional locally (OCR runs inside Docker).

### Backend

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
createdb ems_food && createdb ems_food_test          # or use Docker (see docs/deployment.md)
export DATABASE_URL=postgresql+psycopg://localhost:5432/ems_food
.venv/bin/alembic upgrade head
.venv/bin/python -m app.cli create-admin             # first administrator (interactive, no defaults)
APP_ENV=development .venv/bin/python -m app.cli seed-dev --with-today   # optional fictional demo data
APP_ENV=development .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Interactive API docs: <http://localhost:8000/docs>.

### Mobile / web

```bash
cd apps/mobile
npm install
npx expo start          # press i (iOS simulator), a (Android), w (web admin)
```

In development the app talks to `http://<your-computer>:8000/api/v1` automatically. Set `EXPO_PUBLIC_API_URL` to point elsewhere.

> Push notifications, the camera and secure storage need a **development build** (`npx eas-cli@latest build --profile development`) on Android; Expo Go is fine for everything else.

## Tests & checks

```bash
cd backend && .venv/bin/python -m pytest              # 102 tests incl. the spec §24 acceptance scenario
cd backend && .venv/bin/ruff check app tests && .venv/bin/ruff format --check app tests
docker compose run --rm api pytest -m ocr             # OCR tests (Tesseract is in the image)
cd apps/mobile && npm test && npx tsc --noEmit && npx expo lint && npx expo-doctor
```

## First administrator & onboarding

There are no default credentials. Create the first admin with the CLI (locally or `docker compose exec api python -m app.cli create-admin`), sign in, then add employees one by one or import a CSV (template: [docs/templates/employees-template.csv](docs/templates/employees-template.csv)). Each new account gets a one-time temporary password that must be changed at first sign-in.

## Branding

The logo is a placeholder EMS Food mark. To use the official logo, replace `apps/mobile/assets/images/*.png` (icon, splash, adaptive icon layers, favicon, notification icon), `apps/mobile/components/brand/Logo.tsx`, and `backend/app/assets/logo.png`.

## Documentation

- [Architecture](docs/architecture.md) — components, request flow, business rules, security
- [Database](docs/database.md) — schema, constraints, ER diagram
- [API](docs/api.md) — endpoint reference and error format
- [Restaurant data & menu imports](docs/restaurant-imports.md) — import pipeline, file templates, Talabat status
- [Deployment](docs/deployment.md) — VPS + Docker Compose + HTTPS, mobile builds, push credentials, backups
- [Feature checklist](docs/checklist.md)
