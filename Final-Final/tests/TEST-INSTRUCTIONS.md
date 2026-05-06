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
Expected containers (all Up/healthy): `auth-nginx`, `auth-app-1`, `auth-app-2`, `auth-app-3`, `auth-redis`, `auth-mongodb`, `kafka-broker`, `kafka-zookeeper`, `kafka-ui`

Verify the app responds:
```bash
curl http://localhost/health
# → {"status":"OK", ...}
```

### 2. Flush Redis before each run (optional but recommended)
```bash
docker exec auth-redis redis-cli FLUSHDB
```

---

## Test Files Overview

| File | Tool | Tests | What it covers |
|---|---|---|---|
| `jest/1-auth-core.test.js` | Jest | 22 tests | Register, Login, Logout, Token validate & refresh |
| `jest/2-auth-password.test.js` | Jest | 13 tests | Change password, Forgot password, Reset password |
| `jest/3-auth-sessions.test.js` | Jest | 14 tests | Session list, revoke single/all, emergency lockdown |
| `jest/4-auth-profile.test.js` | Jest | 18 tests | Profile, Preferences, Cookie consent, Audit logs, Delete account |
| `jest/5-oauth.test.js` | Jest | 24 tests | OAuth client CRUD, PKCE full flow, Userinfo, Introspect, Revoke, Scope |
| `jest/6-security.test.js` | Jest | 25 tests | Account lockout, Token blacklist, Session theft detection, Injection, Auth enforcement |
| `jest/7-pdpa.test.js` | Jest | 29 tests | PDPA Art.19/27/28/30/33/37/40 — Consent, Export, Rectification, Access, Erasure, Security measures, Audit trail |
| `k6/k6-perf-test.js` | k6 | 4 scenarios | Load & performance (100–500 VUs) |
| `postman/tas-postman-collection.json` | Newman | 69 assertions | Full API contract (31 requests) |
| `playwright/auth-full.spec.ts` | Playwright | 40 tests | Register, Login, Logout, Token ops, Password, Preferences, Audit, OAuth social |
| `playwright/pages.spec.ts` | Playwright | 13 tests | All 8 HTML pages load correctly |
| `playwright/pages-full.spec.ts` | Playwright | 42 tests | Public pages + user/admin dashboard pages (localStorage auth) |
| `playwright/user.spec.ts` | Playwright | 12 tests | Profile, /me, sessions, PDPA data export & delete |
| `playwright/session.spec.ts` | Playwright | 9 tests | Session list, count, revoke, dashboard session endpoints |
| `playwright/oauth.spec.ts` | Playwright | 13 tests (4 skip) | OIDC discovery, OAuth client CRUD, token introspect, userinfo |
| `playwright/dashboard.spec.ts` | Playwright | 28 tests | Dashboard user/admin analytics, monitoring, logs endpoints |
| `playwright/security.spec.ts` | Playwright | 21 tests | Security headers, input validation, rate limiting, access control |
| `playwright/client.spec.ts` | Playwright | 21 tests (skip if no client app) | Client app pages, PKCE auth, social-callback, logout |

---

## Test 0 — Jest Integration Tests

**Tool:** Jest + Node.js built-in http  
**Config:** `Final-Final/tests/jest/jest.config.js`  
**Expected:** 145 passed (116 from files 1–6 + 29 from 7-pdpa), 0 failed  
**Runtime:** ~2 minutes

### Run all 7 files
```bash
cd C:\Users\ASUS\Documents\TEST\TESTMONO
npx jest --config Final-Final/tests/jest/jest.config.js --runInBand
```

### Run a single file
```bash
npx jest --config Final-Final/tests/jest/jest.config.js Final-Final/tests/jest/7-pdpa.test.js --runInBand
```

### Save JSON report
```bash
npx jest --config Final-Final/tests/jest/jest.config.js --runInBand \
  --json --outputFile Final-Final/tests/jest/results/jest-results.json
```

### What each file covers
| File | Describe groups | Tests | What's tested |
|---|---|---|---|
| `1-auth-core.test.js` | Register, Login, Logout, Token Operations | 22 | Valid/invalid register, login, logout blacklisting, token validate & refresh rotation |
| `2-auth-password.test.js` | Change Password, Forgot Password, Reset Password | 13 | Password change flow, forgot-password no-enumeration, reset with invalid/expired tokens |
| `3-auth-sessions.test.js` | Get Sessions, Revoke Single, Revoke All Others, Emergency Lockdown | 14 | Session listing, single revoke, bulk revoke, lockdown invalidates all tokens |
| `4-auth-profile.test.js` | Get Profile, Preferences, Cookie Consent, Audit Logs, Delete Account | 18 | Profile read, preference update, consent toggle, audit log access, account deletion |
| `5-oauth.test.js` | Client Registration, Client CRUD, PKCE Flow, Userinfo, Introspect, Revoke Token, Scope Enforcement | 24 | Full PKCE authorization code flow, token exchange, refresh, revoke, scope validation |
| `6-security.test.js` | Account Lockout, Token Blacklisting, Session Theft, Input Validation, Auth Enforcement, OIDC | 25 | Brute-force lockout, post-logout blacklist, refresh token reuse detection, NoSQL/SQL injection, 8 protected endpoints |
| `7-pdpa.test.js` | Right to Access, Rectification, Data Portability, Erasure, Consent Management, Security Measures, Audit Trail | 29 | PDPA Art.19/27/28/30/33/37/40 — access, correct data, export, delete, consent grant/withdraw, password not exposed, rate limiting, headers, audit transparency |

---

## Test 1 — Newman / Postman API Tests

**Tool:** Newman  
**Collection:** `Final-Final/tests/postman/tas-postman-collection.json`  
**Expected:** 69/69 assertions pass, 31 requests

### Run
```bash
newman run "Final-Final/tests/postman/tas-postman-collection.json" \
  --env-var "baseUrl=http://localhost" \
  --reporters cli \
  --delay-request 300
```

### Save JSON report
```bash
newman run "Final-Final/tests/postman/tas-postman-collection.json" \
  --env-var "baseUrl=http://localhost" \
  --reporters cli,json \
  --reporter-json-export "Final-Final/tests/postman/results/newman-report.json" \
  --delay-request 300
```

### What it tests (by group)
| Group | Requests | Assertions |
|---|---|---|
| 00 — Health & Well-Known | 2 | Health endpoint, OIDC discovery |
| 01 — Authentication | 9 | Register, Login, Profile, Refresh token, Forgot-password, Logout |
| 02 — User Management | 4 | GET/PUT /api/users/me & /profile |
| 03 — Sessions | 3 | List sessions, revoke-all-others |
| 04 — OAuth 2.0 | 6 | Client CRUD, introspect, userinfo, revoke token |
| 05 — Security Headers | 4 | Security headers, rate-limit, 404 responses |
| 06 — Dashboard | 3 | Dashboard endpoints blocked without auth |

---

## Test 2 — Playwright E2E Tests

**Tool:** Playwright (Chromium headless)  
**Config:** `Final-Final/tests/playwright/playwright.config.ts`  
**Expected:** 161 passed, 4 skipped (OAuth requires pre-existing clientId)

### Run all specs (from project root)
```bash
cd C:\Users\ASUS\Documents\TEST\TESTMONO

npx playwright test \
  Final-Final/tests/playwright/auth-full.spec.ts \
  Final-Final/tests/playwright/pages.spec.ts \
  Final-Final/tests/playwright/pages-full.spec.ts \
  Final-Final/tests/playwright/user.spec.ts \
  Final-Final/tests/playwright/session.spec.ts \
  Final-Final/tests/playwright/oauth.spec.ts \
  Final-Final/tests/playwright/dashboard.spec.ts \
  Final-Final/tests/playwright/security.spec.ts \
  --project=chromium --reporter=list
```

### Run from Final-Final/tests/playwright/ folder (uses local config)
```bash
cd C:\Users\ASUS\Documents\TEST\TESTMONO\Final-Final\tests\playwright

npx playwright test auth-full.spec.ts pages.spec.ts pages-full.spec.ts \
  user.spec.ts session.spec.ts oauth.spec.ts dashboard.spec.ts security.spec.ts \
  --project=chromium --reporter=list
```

### Run a single spec file
```bash
npx playwright test Final-Final/tests/playwright/security.spec.ts --project=chromium --reporter=list
```

### Run with HTML report
```bash
npx playwright test Final-Final/tests/playwright/auth-full.spec.ts \
  --project=chromium --reporter=html
npx playwright show-report
```

### Run headed (visible browser)
```bash
npx playwright test Final-Final/tests/playwright/auth-full.spec.ts --project=chromium --headed
```

### What each spec covers
| File | Describe group | Tests | What's tested |
|---|---|---|---|
| `auth-full.spec.ts` | 02 — Register | 5 | New user, duplicate email, missing consent, password mismatch |
| `auth-full.spec.ts` | 03 — Login | 5 | Valid login, wrong password, missing fields, non-existent user |
| `auth-full.spec.ts` | 04 — Profile & Token | 6 | Valid token, invalid token, refresh, validate-token endpoint |
| `auth-full.spec.ts` | 05 — Password Management | 4 | Forgot-password, reset-password bad token, change-password |
| `auth-full.spec.ts` | 06 — Preferences & Consent | 3 | GET/PUT preferences, cookie-consent update |
| `auth-full.spec.ts` | 07 — Audit & Security | 3 | Audit-logs, security-audit, emergency-lockdown |
| `auth-full.spec.ts` | 08 — OAuth Social | 3 | OAuth status, Google + GitHub redirect |
| `auth-full.spec.ts` | 09 — Logout | 1 | Logout returns 200 |
| `pages.spec.ts` | 01 — Page Rendering | 13 | All 8 HTML pages load, key form elements present |
| `pages-full.spec.ts` | 28 — Public Pages | 10 | All public pages load (no 5xx) |
| `pages-full.spec.ts` | 29 — User Pages | 20 | Dashboard, profile, settings, api-keys, user-activity with localStorage token |
| `pages-full.spec.ts` | 30 — Admin Pages | 12 | admin, admin-logs, admin-monitoring, admin-analytics pages |
| `user.spec.ts` | 10 — User Profile | 5 | GET/PUT profile, /me, sessions, unauthenticated |
| `user.spec.ts` | 11 — PDPA Rights | 3 | Export data, auth-required checks, delete account requires auth |
| `session.spec.ts` | 12 — Sessions | 9 | List sessions, count, revoke, dashboard session endpoints |
| `oauth.spec.ts` | 13 — OIDC Discovery | 2 | /.well-known/openid-configuration & /jwks.json |
| `oauth.spec.ts` | 14 — OAuth Clients | 5 | POST/GET/PUT/DELETE OAuth client management |
| `oauth.spec.ts` | 15 — Token Operations | 6 (4 skip) | Introspect, userinfo, authorize redirect |
| `dashboard.spec.ts` | 16 — Dashboard User | 7 | User dashboard endpoints, auth required |
| `dashboard.spec.ts` | 17 — Admin Analytics | 7 | Admin analytics, blocked for non-admin users |
| `dashboard.spec.ts` | 18 — Admin Monitoring | 6 | Health, realtime, metrics, security-events |
| `dashboard.spec.ts` | 19 — Admin Logs | 8 | Log endpoints, user list, blocked for users |
| `security.spec.ts` | 20 — Security Headers | 12 | nosniff, CSP, X-Powered-By, X-Frame, XSS, Referrer-Policy |
| `security.spec.ts` | 21 — Input Validation | 5 | XSS, SQL injection, oversized body, invalid email/password |
| `security.spec.ts` | 22 — Rate Limiting | 2 | Login rate limit enforced, repeated wrong logins → 429/423 |
| `security.spec.ts` | 23 — Access Control | 2 | 13 protected endpoints require auth, cross-user access blocked |

---

## Test 3 — k6 Load & Performance Test

**Tool:** k6  
**File:** `Final-Final/tests/k6/k6-perf-test.js`  
**Runtime:** ~4 minutes  
**Expected:** checks ≥ 99%

### Run
```bash
"/c/Program Files/k6/k6.exe" run \
  --env BASE_URL=http://localhost \
  "Final-Final/tests/k6/k6-perf-test.js"
```

### Save JSON results
```bash
"/c/Program Files/k6/k6.exe" run \
  --env BASE_URL=http://localhost \
  --out json="Final-Final/tests/k6/results/k6-results-$(date +%Y%m%d).json" \
  "Final-Final/tests/k6/k6-perf-test.js"
```

### Scenarios
| Scenario | VUs | Duration | Endpoint | What it tests |
|---|---|---|---|---|
| `login_100vu` | 100 | 45s | POST /api/auth/login | Login throughput at moderate load |
| `profile_100vu` | 100 | 45s | GET /api/auth/profile | Authenticated read at moderate load |
| `login_500vu` | 500 | 60s | POST /api/auth/login | Login under heavy load (rate limiter active) |
| `profile_500vu` | 500 | 60s | GET /api/auth/profile | Authenticated read under heavy load |

**Note:** `login_duration` and `http_req_failed` thresholds cross under 500 VU load — expected, because the rate limiter (5 attempts/15 min) returns 429 for most login VUs at that scale. `checks_succeeded` metric remains ≥ 99%.

---

## Test 4 — OWASP ZAP Security Scan

**Tool:** OWASP ZAP v2.16 (Docker)  
**Results:** `Final-Final/tests/zap/results/`  
**Runtime:** ~8 minutes

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

### View report
Open in browser: `Final-Final/tests/zap/results/zap-baseline-report.html`

### Expected results
- **FAIL:** 0
- **WARN:** ~12 (CSP directives, SRI missing, server version in header)
- **PASS:** 55+

---

## Run Everything (Quick Reference)

```bash
# ─── 0. Start stack ────────────────────────────────────────────────────────────
cd C:\Users\ASUS\Documents\TEST\TESTMONO
docker-compose up -d
docker exec auth-redis redis-cli FLUSHDB

# ─── 1. Jest integration tests (~2 min) ───────────────────────────────────────
npx jest --config Final-Final/tests/jest/jest.config.js --runInBand \
  --json --outputFile Final-Final/tests/jest/results/jest-results.json

# ─── 2. Newman API tests (~20s) ───────────────────────────────────────────────
newman run "Final-Final/tests/postman/tas-postman-collection.json" \
  --env-var "baseUrl=http://localhost" \
  --reporters cli --delay-request 300

# ─── 3. Playwright E2E (~1.5 min) ─────────────────────────────────────────────
npx playwright test \
  Final-Final/tests/playwright/auth-full.spec.ts \
  Final-Final/tests/playwright/pages.spec.ts \
  Final-Final/tests/playwright/pages-full.spec.ts \
  Final-Final/tests/playwright/user.spec.ts \
  Final-Final/tests/playwright/session.spec.ts \
  Final-Final/tests/playwright/oauth.spec.ts \
  Final-Final/tests/playwright/dashboard.spec.ts \
  Final-Final/tests/playwright/security.spec.ts \
  --project=chromium --reporter=list

# ─── 4. k6 load test (~4 min) ─────────────────────────────────────────────────
"/c/Program Files/k6/k6.exe" run \
  --env BASE_URL=http://localhost \
  "Final-Final/tests/k6/k6-perf-test.js"

# ─── 5. ZAP security scan (~8 min) ────────────────────────────────────────────
docker run --rm --network testmono_auth-network \
  -v "C:/Users/ASUS/Documents/TEST/TESTMONO/Final-Final/tests/zap/results:/zap/wrk:rw" \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t http://nginx -r zap-baseline-report.html \
  -J zap-baseline-report.json -m 2 -I
```

---

## Automated Full Run (all 6 suites + PNG reports)

The Python script runs everything and saves PNG screenshots of results:

```bash
cd C:\Users\ASUS\Documents\TEST\TESTMONO
docker exec auth-redis redis-cli FLUSHDB
python -X utf8 tests/run_all_and_capture.py
```

Results saved to `tests/pic/` — one PNG per suite + `00_SUMMARY_*.png`.
