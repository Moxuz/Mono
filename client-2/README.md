# Client 2 — Workspace OAuth mockup

Small second-party client for testing that one AuthSys instance can serve multiple OAuth applications.

## Local run

1. Register a second OAuth client in AuthSys with this redirect URI:

   `http://localhost:3002/callback`

2. Copy `.env.example` to `.env` and add its credentials:

   `CLIENT_ID=...`

   `CLIENT_SECRET=...`

3. Start the client without Docker:

   `npm install && npm start`

   A direct development run uses the in-memory session store when
   `USE_REDIS_SESSIONS=false`. The Docker/production stack always uses the
   dedicated client-session Redis and never receives AuthSys MongoDB credentials.

4. Or start it with Docker:

   Set `CLIENT_REDIS_PASSWORD` in the root `.env`, then run:

   `docker compose -f docker-compose.client.yml up -d client-session-redis client-app-2`

Open `http://localhost:3002`.

The dashboard is protected by the OAuth callback and the browser receives only an HttpOnly session cookie; access tokens stay in the client server session.
