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

   MongoDB is optional for this mock client in development; it uses the
   express-session memory store when `MONGODB_URI` is empty.

4. Or start it with Docker:

   `docker compose -f docker-compose.client.yml up -d client-app-2`

Open `http://localhost:3002`.

The dashboard is protected by the OAuth callback and the browser receives only an HttpOnly session cookie; access tokens stay in the client server session.
