# Private-project deployment guide

This project is intentionally kept as a small private OAuth/OIDC deployment.

## Default stack

The default Compose stack starts:

- Nginx
- AuthSys
- MongoDB
- Redis

Kafka and Zookeeper are optional. They are not required for normal authentication or file-based application logging.

Start the default stack:

    docker compose up -d --build

Enable Kafka only when centralized log streaming is actually needed:

    docker compose --profile kafka up -d

The application default is USE_KAFKA_LOGGING=false. Do not enable Kafka just to run the normal OAuth flow.

## Network boundary

Only the reverse proxy should publish an application port.

Expected public ports:

- HTTP 80 for redirect/ACME
- HTTPS 443 when the HTTPS overlay is enabled

MongoDB, Redis, Zookeeper, and Kafka must remain on the Docker network. They must not have public host mappings in the production Compose file.

The optional docker-compose.kafka.yml is for local testing. Its host mappings are bound to 127.0.0.1 and Kafka UI is intentionally not deployed.

## Alibaba/VPS security-group checklist

This repository cannot change a cloud security group automatically. Before exposing a VPS:

1. Allow TCP 80 and 443 from the internet.
2. Allow TCP 22 only from your own fixed IP, VPN, or bastion.
3. Remove any All Traffic rule with source 0.0.0.0/0.
4. Do not allow 27017, 6379, 2181, 9092, or 29092 from the internet.
5. Remove duplicate broad SSH rules after confirming the restricted rule works.
6. Test from a different network that only the intended HTTP/HTTPS endpoints respond.

The cloud-console security group is authoritative even if Docker itself has no published database ports.

## Required production configuration

Use stable, private values for:

- SESSION_SECRET
- JWT_SECRET
- OIDC_PRIVATE_KEY and OIDC_PUBLIC_KEY
- MONGO_ROOT_USERNAME and MONGO_ROOT_PASSWORD
- REDIS_PASSWORD
- BASE_URL, AUTH_SERVER_URL, and OAuth callback URLs

For a public deployment use HTTPS callback URLs. HTTP localhost callbacks are allowed only in development.

Keep OAuth client secrets on the server side. Browser code receives only the client session cookie; it must never receive client_secret, access_token, or refresh_token.

For the default Docker stack, keep `BASE_URL`, `AUTH_SERVER_URL`, and `AUTH_PUBLIC_URL` on the same Nginx origin (for example `http://localhost`). Use `:5000` only when running AuthSys directly without Nginx.
Client 2 reads `CLIENT_ID`, `CLIENT_SECRET`, and `REDIRECT_URI` from `client-2/.env` in the base client Compose file; the VPS overlay supplies the production callback URL. The overlay can render while client-2 is disabled, but a production client-2 process fails fast unless all three values plus its session secret are present.

## OAuth policy

This private deployment accepts confidential web clients only.

The authorization flow is:

    AuthSys browser session -> authorization code + state + nonce + PKCE S256 -> token endpoint

Supported response and grants:

- response_type=code
- grant_type=authorization_code
- grant_type=refresh_token only for clients that explicitly register offline_access

Supported scopes are openid, profile, email, and explicitly requested offline_access. Custom resource scopes are rejected until a resource API enforces them.

Consent is Allow or Deny. Consent can be revoked per client from the AuthSys account area.

## Operations

Check service health:

    docker compose ps
    docker compose logs --tail=200 auth-app-1
    docker compose exec auth-app-1 wget -qO- http://localhost:5000/health

Check resource pressure on a small VPS:

    free -h
    docker stats --no-stream
    docker system df

Keep MongoDB and Redis volumes backed up before upgrades. Do not remove named volumes during a routine redeploy.


## VPS test path when local Docker Desktop is unavailable

The application is portable: run the same Compose files on any Linux VPS with Docker Engine and Compose v2. The cloud provider is not part of the application runtime contract.

Deploy source without copying secrets:

    scp -i <key> <source-archive> root@<vps>:/root/testmono-auth/

Use the production overlay and rebuild only the changed application/proxy services:

    docker compose -f docker-compose.yml -f deploy/vps/docker-compose.vps.yml -f docker-compose.client.yml -f deploy/vps/docker-compose.client.vps.yml up -d --build --force-recreate --no-deps auth-app-1 client-app-1 nginx

The production images use Node 20-alpine and `npm ci --omit=dev`. Keep MongoDB, Redis, Kafka, Zookeeper, named volumes, and OIDC keys in place. Do not use `down -v` for a normal release.

Run the bearer/API integration suites from an ephemeral test container attached to the live auth network:

    docker run --rm --network container:auth-app-1 --tmpfs /workspace/node_modules:rw,exec -v /root/testmono-auth:/workspace -w /workspace node:20-alpine sh -c "npm ci --ignore-scripts && TEST_BASE_URL=http://127.0.0.1:5000 npx jest tests/1-auth-core.test.js tests/2-auth-password.test.js tests/3-auth-sessions.test.js tests/4-auth-profile.test.js tests/6-security.test.js --runInBand"

Run browser-cookie/OAuth consent tests through the public HTTPS origin, because production cookies are Secure:

    TEST_BASE_URL=https://<auth-domain> TEST_REDIRECT_URI=https://<client-domain>/callback npx jest tests/5-oauth.test.js --runInBand

Expected release checks:

- auth-app, MongoDB, Redis, Kafka, Zookeeper, and client containers healthy
- Redis PONG and MongoDB ping successful
- AuthSys health and OIDC discovery return HTTP 200 over HTTPS
- OAuth PKCE, refresh rotation, UserInfo, introspection, revoke, and scope tests pass

The local Docker Desktop engine may remain unavailable; that does not prevent this VPS test path.