# Deployment

Target: one small Linux VPS (2 vCPU / 2–4 GB RAM is plenty for ~18 users) running Docker Compose with PostgreSQL, the API, the scheduler worker and Caddy for automatic HTTPS.

## 1. Server prerequisites

- A domain or sub-domain, e.g. `food.example.com`, with a DNS **A record** pointing to the VPS.
- Ports 80 and 443 open.
- Docker Engine + Docker Compose plugin.

## 2. Configure

```bash
git clone <this repository> ems-food && cd ems-food
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # use for JWT_SECRET
python3 -c "import secrets; print(secrets.token_urlsafe(24))"   # use for POSTGRES_PASSWORD
nano .env   # set API_DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD, JWT_SECRET, CORS_ORIGINS=https://<API_DOMAIN>
```

`APP_ENV=production` refuses to start with the development JWT secret.

## 3. Build the web admin (optional but recommended)

The same Expo project builds a browser version that Caddy serves at `https://<API_DOMAIN>/` (the API lives under `/api`).

```bash
cd apps/mobile
npm ci
EXPO_PUBLIC_API_URL=https://food.example.com/api/v1 npx expo export --platform web   # → apps/mobile/dist
cd ../..
```

## 4. Start

```bash
docker compose up -d --build
docker compose ps                                        # api should become "healthy"
curl https://food.example.com/api/v1/health
docker compose exec api python -m app.cli create-admin   # first administrator (no default credentials)
```

Migrations run automatically when the API container starts (`alembic upgrade head`). The `worker` service runs scheduled jobs (auto-close, reminders, push receipts).

Logs: `docker compose logs -f api worker`. Updates: `git pull && docker compose up -d --build`.

## 5. Mobile apps (EAS)

1. Install/sign in: `npx eas-cli@latest login`, then `cd apps/mobile && npx eas-cli@latest init` (creates the EAS project; put its id in `EAS_PROJECT_ID` or let EAS write it).
2. Set the API URL for builds in `eas.json` (`EXPO_PUBLIC_API_URL`, must be HTTPS).
3. **Android** (no local Android SDK needed — EAS builds in the cloud):
   - Internal test APK: `npx eas-cli@latest build --platform android --profile preview`
   - Play Store bundle: `npx eas-cli@latest build --platform android --profile production`
   - Push notifications need Firebase Cloud Messaging V1 credentials: create a Firebase project, download `google-services.json` (set `GOOGLE_SERVICES_JSON` to its path), and upload the FCM V1 service-account key with `npx eas-cli@latest credentials`.
4. **iOS** (requires a paid Apple Developer account):
   - `npx eas-cli@latest build --platform ios --profile production` — EAS creates certificates, profiles and the APNs key.
   - Distribute via TestFlight: `npx eas-cli@latest submit --platform ios`.
5. **Development builds** (for testing push, camera and secure storage on devices): `npx eas-cli@latest build --profile development --platform android|ios`, then `npx expo start`.

Bundle identifiers: `com.emscompany.emsfood` (`.dev` for development builds) — change in `apps/mobile/app.config.ts` if needed.

## 6. Push notifications

The API sends pushes through the free Expo Push Service (`https://exp.host/--/api/v2/push/send`). Nothing else is required server-side; set `EXPO_ACCESS_TOKEN` only if you enable "enhanced push security" in your Expo account. Users who deny notification permission still get in-app notifications.

## 7. Optional email

Without SMTP, "Forgot password" notifies administrators, who issue a one-time reset code in the app. To email codes directly, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`.

## Backups

Nightly database dump kept for 14 days (host crontab):

```cron
15 2 * * * cd /srv/ems-food && docker compose exec -T db pg_dump -U ems -Fc ems_food > backups/ems_food-$(date +\%F).dump && find backups -name '*.dump' -mtime +14 -delete
```

Restore: `docker compose exec -T db pg_restore -U ems -d ems_food --clean < backups/ems_food-YYYY-MM-DD.dump`.
Uploaded images live in the `media` volume — back it up too (`docker run --rm -v ems-food_media:/m -v $PWD/backups:/b alpine tar czf /b/media.tgz -C /m .`).

## Running without Docker (development)

See the [README quick start](../README.md#quick-start-development). Tests use a separate database (`ems_food_test` by default; override with `DATABASE_URL`).
