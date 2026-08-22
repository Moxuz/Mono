# AuthSys local fallback stack

This folder is a self-contained Docker fallback for development when the VPS,
DuckDNS, or the HTTPS deployment is unavailable. It uses plain HTTP on
`localhost` and does not depend on a public domain or a VPS.

## Local URLs

- AuthSys: `http://localhost:8080`
- Client 1 (ShopHub): `http://localhost:3001`
- Client 2 (Workspace mock): `http://localhost:3002`
- Health check: `http://localhost:8080/health`

The stack has its own Docker network and named volumes, so it does not use the
production/VPS network, certificates, or DuckDNS settings. MongoDB and Redis
start by default. Kafka is optional because it is relatively heavy for a
small local fallback.

## First run (PowerShell)

```powershell
Set-Location deploy/local-fallback
Copy-Item .env.example .env
notepad .env
.\start-local.ps1
```

Before testing OAuth SSO, create local OAuth clients in the AuthSys developer
portal at `http://localhost:8080/developer-portal.html` and copy the returned
credentials into `.env`:

- Client 1 redirect URI: `http://localhost:3001/callback`
- Client 2 redirect URI: `http://localhost:3002/callback`

The local fallback uses a fresh MongoDB volume. OAuth client records from the
VPS are not automatically available here, so local client credentials must be
registered again (or the local database must be restored deliberately).

The same flow can be started without the helper script:

```powershell
docker compose --project-name authsys-local --env-file .env -f docker-compose.local.yml up -d --build
docker compose --project-name authsys-local --env-file .env -f docker-compose.local.yml ps
```

## Optional Google/GitHub login

Username/password login works without provider credentials. To test Google or
GitHub locally, configure the provider app with these callback URLs:

- Google: `http://localhost:8080/api/auth/google/callback`
- GitHub: `http://localhost:8080/api/auth/github/callback`

Put the provider ID and secret in `.env`. Public HTTPS callbacks from the VPS
are separate from these local HTTP callbacks.

## Optional Kafka

Set `USE_KAFKA_LOGGING=true` in `.env`, then start with the Kafka profile:

```powershell
docker compose --project-name authsys-local --env-file .env -f docker-compose.local.yml --profile kafka up -d --build
```

Leave it disabled for the lightest local fallback.

## Stop and troubleshooting

```powershell
.\stop-local.ps1
docker compose --project-name authsys-local --env-file .env -f docker-compose.local.yml logs -f auth proxy
```

`down` keeps the local MongoDB/Redis data. `down -v` removes those volumes and
therefore resets local users, OAuth clients, sessions, and logs; use it only
when a full local reset is intended.

This configuration is development-only: it deliberately uses HTTP and
`COOKIE_SECURE=false`. Do not expose port 8080 to the Internet or reuse these
local secrets in the HTTPS/VPS deployment.
