# TAS Authentication Server — Manual Test Instructions

All tests run against the live stack at **http://localhost** (Nginx → 3× auth-app).

---

## Prerequisites

### 1. Start the Docker stack
```bash
cd C:\Users\ASUS\Documents\TEST\TESTMONO
docker-compose up -d
```

Wait until all containers are healthy:
```bash
docker ps
```
Expected: `auth-nginx`, `auth-app-1/2/3`, `auth-redis`, `auth-mongodb`, `kafka-broker`, `zookeeper`, `kafka-ui` — all Up.

Verify:
```bash
curl http://localhost/health
# → {"status":"OK", ...}
```

### 2. Required pre-created test accounts
These accounts must exist in the database (created in an earlier session):
- `k6user1@example.com` / `K6Test99!`
- `k6user2@example.com` / `K6Test99!`
- `k6user3@example.com` / `K6Test99!`

If they are missing, recreate them:
```bash
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"k6user1","email":"k6user1@example.com","password":"K6Test99!","confirmPassword":"K6Test99!","consentEssential":true}'
```
Repeat for k6user2 and k6user3. Note: rate limit is 3 registrations/hour.

---

## Test 1 — k6 Performance Load Test

**Tool:** k6 v1.7.0
**Test file:** `tests/k6/k6-perf-test.js`
**Results:** `tests/k6/results/`

### Run
```bash
"C:\Program Files\k6\k6.exe" run ^
  --env BASE_URL=http://localhost ^
  "C:\Users\ASUS\Documents\TEST\TESTMONO\Final-Final\tests\k6\k6-perf-test.js"
```

Or from bash:
```bash
"/c/Program Files/k6/k6.exe" run \
  --env BASE_URL=http://localhost \
  "C:/Users/ASUS/Documents/TEST/TESTMONO/Final-Final/tests/k6/k6-perf-test.js"
```

### Save results to file
```bash
"/c/Program Files/k6/k6.exe" run \
  --env BASE_URL=http://localhost \
  --out json=tests/k6/results/k6-results-new.json \
  "C:/Users/ASUS/Documents/TEST/TESTMONO/Final-Final/tests/k6/k6-perf-test.js"
```

### Scenarios
| Scenario | VUs | Duration | Endpoint |
|---|---|---|---|
| login_100vu | 100 | 45s | POST /api/auth/login |
| profile_100vu | 100 | 45s | GET /api/auth/profile |
| login_500vu | 500 | 60s | POST /api/auth/login |
| profile_500vu | 500 | 60s | GET /api/auth/profile |

**Total runtime:** ~4 minutes
**Note:** Login tests show high avg latency (rate-limited at 5/15min by design).

---

## Test 2 — OWASP ZAP Security Scan

**Tool:** OWASP ZAP v2.16 (Docker)
**Results:** `tests/zap/results/`

### Prerequisites
Docker must be running and the auth stack must be up on `testmono_auth-network`.

### Run baseline scan
```bash
docker run --rm \
  --network testmono_auth-network \
  -v "C:/Users/ASUS/Documents/TEST/TESTMONO/Final-Final/tests/zap/results:/zap/wrk:rw" \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py \
    -t http://nginx \
    -r zap-baseline-report.html \
    -J zap-baseline-report.json \
    -m 2 \
    -I
```

**Flags:**
- `-t http://nginx` — target (internal Docker network hostname)
- `-r` / `-J` — HTML and JSON report filenames (saved in mounted `/zap/wrk`)
- `-m 2` — spider for max 2 minutes
- `-I` — don't fail on warnings (exit 0)

**Runtime:** ~5–8 minutes (ZAP startup ~2min + spider 2min + passive scan)

### View HTML report
Open in browser: `tests/zap/results/zap-baseline-report.html`

### Expected results
- **FAIL:** 0
- **WARN:** 12 (CSP directives, SRI missing, server version header)
- **PASS:** 55

---

## Test 3 — Postman / Newman API Tests

**Tool:** Newman v6.2.2
**Collection:** `tests/postman/tas-postman-collection.json`
**Results:** `tests/postman/results/`

### Prerequisites
```bash
newman --version
# Should print 6.x.x
# If not installed: npm install -g newman
```

### Run
```bash
newman run \
  "C:/Users/ASUS/Documents/TEST/TESTMONO/Final-Final/tests/postman/tas-postman-collection.json" \
  --env-var "baseUrl=http://localhost" \
  --reporters cli,json \
  --reporter-json-export "C:/Users/ASUS/Documents/TEST/TESTMONO/Final-Final/tests/postman/results/newman-report.json" \
  --delay-request 300
```

### Expected results
- **Requests:** 31
- **Assertions:** 69/70 pass (98.6%)
- **Known failure:** POST /api/auth/logout → 504 Gateway Timeout (known bug in logout handler)
- **Runtime:** ~1m 20s (includes 1min logout timeout)

### Test groups
| Group | Requests | Tests |
|---|---|---|
| 00 — Health & Well-Known | 2 | Health, OIDC discovery |
| 01 — Authentication | 9 | Register, Login, Profile, Refresh, Forgot-pw, Logout |
| 02 — User Management | 4 | GET/PUT /api/users/me & /profile |
| 03 — Sessions | 3 | List, revoke-all-others |
| 04 — OAuth 2.0 | 6 | Client CRUD, introspect, userinfo, revoke |
| 05 — Security Headers | 4 | Headers, rate-limit, 404 |
| 06 — Dashboard | 3 | All 3 endpoints blocked without auth |

---

## Test 4 — Playwright E2E Tests (Comprehensive)

**Tool:** Playwright v1.x (Chromium)
**Test files:** `e2e/` directory (8 spec files + helpers)
**Config:** `playwright.config.ts` (project root)
**Results:** `playwright-report/`

Also archived in: `Final-Final/tests/playwright/`

> **Important:** Run from the project root. Client app must also be running (`http://localhost:3001`).

### 4a. Start the client app (required for describe groups 24–27)
```bash
cd C:\Users\ASUS\Documents\TEST\TESTMONO\cLient-app-1
node server.js &
```

### 4b. Run from project root
```bash
cd C:\Users\ASUS\Documents\TEST\TESTMONO

# Run full comprehensive suite (Chromium only, headless) — ~1.2 minutes
npx playwright test e2e/auth-full.spec.ts e2e/pages.spec.ts e2e/user.spec.ts \
  e2e/session.spec.ts e2e/oauth.spec.ts e2e/dashboard.spec.ts \
  e2e/security.spec.ts e2e/client.spec.ts --project=chromium --reporter=list

# Run with HTML report
npx playwright test e2e/auth-full.spec.ts e2e/pages.spec.ts e2e/user.spec.ts \
  e2e/session.spec.ts e2e/oauth.spec.ts e2e/dashboard.spec.ts \
  e2e/security.spec.ts e2e/client.spec.ts --project=chromium --reporter=html

# Run a single spec file
npx playwright test e2e/security.spec.ts --project=chromium --reporter=list

# Run a specific describe group
npx playwright test --project=chromium -g "20 — Security Headers"

# Run headed (visible browser)
npx playwright test e2e/auth-full.spec.ts --project=chromium --headed

# Run original 25-test suite only (legacy)
npx playwright test e2e/auth.spec.ts --project=chromium --reporter=list
```

### View HTML report
After running with `--reporter=html`:
```bash
npx playwright show-report
```
Or open: `playwright-report/index.html`

### Expected results (comprehensive suite)
- **Tests:** 141 pass, 3 skip (100% — skips are OAuth tests requiring active clientId)
- **Runtime:** ~1.2 minutes (8 parallel workers)

### Test groups
| Describe | Tests | What's tested | File |
|---|---|---|---|
| 01 — Page Rendering | 13 | All 8 HTML pages load, key form elements, timing | pages.spec.ts |
| 02 — Register | 5 | New user, duplicate, missing consent, password mismatch | auth-full.spec.ts |
| 03 — Login | 5 | Valid, wrong password, missing fields, non-existent user | auth-full.spec.ts |
| 04 — Profile & Token | 6 | Valid/invalid token, refresh, validate-token | auth-full.spec.ts |
| 05 — Password Management | 4 | Forgot-password, reset-password bad token, change-password | auth-full.spec.ts |
| 06 — Preferences & Consent | 3 | GET/PUT preferences, cookie-consent update | auth-full.spec.ts |
| 07 — Audit & Security | 3 | Audit-logs, security-audit, emergency-lockdown | auth-full.spec.ts |
| 08 — OAuth Social | 3 | oauth/status, Google + GitHub redirect | auth-full.spec.ts |
| 09 — Logout | 1 | Logout completes (200 or 504 known timeout) | auth-full.spec.ts |
| 10 — User Profile | 5 | GET/PUT profile, /me, sessions, unauthenticated | user.spec.ts |
| 11 — PDPA Rights | 3 | Export data, auth-required checks | user.spec.ts |
| 12 — Sessions | 9 | List, count, revoke, dashboard session endpoints | session.spec.ts |
| 13 — OIDC Discovery | 2 | /.well-known endpoints | oauth.spec.ts |
| 14 — OAuth Clients | 5 | POST/GET/PUT/DELETE client management | oauth.spec.ts |
| 15 — Token Operations | 6 | Introspect, userinfo, authorize redirect | oauth.spec.ts |
| 16 — Dashboard User | 7 | User dashboard endpoints, auth required | dashboard.spec.ts |
| 17 — Admin Analytics | 7 | Admin analytics endpoints, blocked for users | dashboard.spec.ts |
| 18 — Admin Monitoring | 6 | Health, realtime, metrics, security-events | dashboard.spec.ts |
| 19 — Admin Logs | 8 | Log endpoints, user list, blocked for users | dashboard.spec.ts |
| 20 — Security Headers | 12 | nosniff, CSP, X-Powered-By, X-Frame, XSS, Referrer | security.spec.ts |
| 21 — Input Validation | 5 | XSS, SQL injection, oversized body, invalid email/pw | security.spec.ts |
| 22 — Rate Limiting | 2 | Login responds correctly, repeated wrong logins | security.spec.ts |
| 23 — Access Control | 2 | 13 protected endpoints, cross-user access blocked | security.spec.ts |
| 24 — Client Pages | 4 | Client app page load, login redirect, PKCE | client.spec.ts |
| 25 — Client Auth Control | 5 | Unauthenticated redirects, /api/session, /api/refresh | client.spec.ts |
| 26 — Client Authenticated | 5 | Login via social-callback, dashboard/products/profile | client.spec.ts |
| 27 — Client Logout & OAuth | 7 | Logout, callback edge cases, invalid state | client.spec.ts |

---

## Quick reference — all test commands

```bash
# 1. Start stack
cd C:\Users\ASUS\Documents\TEST\TESTMONO && docker-compose up -d

# 2. k6 load test (~4 min)
"/c/Program Files/k6/k6.exe" run --env BASE_URL=http://localhost \
  Final-Final/tests/k6/k6-perf-test.js

# 3. ZAP security scan (~8 min)
docker run --rm --network testmono_auth-network \
  -v "$(pwd)/Final-Final/tests/zap/results:/zap/wrk:rw" \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t http://nginx -r zap-baseline-report.html \
  -J zap-baseline-report.json -m 2 -I

# 4. Newman API tests (~1m 20s)
newman run Final-Final/tests/postman/tas-postman-collection.json \
  --env-var baseUrl=http://localhost \
  --reporters cli,json \
  --reporter-json-export Final-Final/tests/postman/results/newman-report.json \
  --delay-request 300

# 5. Playwright E2E comprehensive (~1.2 min)
npx playwright test e2e/auth-full.spec.ts e2e/pages.spec.ts e2e/user.spec.ts \
  e2e/session.spec.ts e2e/oauth.spec.ts e2e/dashboard.spec.ts \
  e2e/security.spec.ts e2e/client.spec.ts --project=chromium --reporter=list
```
