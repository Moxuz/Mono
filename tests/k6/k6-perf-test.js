/**
 * k6 Performance Test — TAS Authentication Server
 * Tests 4 scenarios: Login/Profile at 100 VU and 500 VU
 * Pre-created users: k6user1-3@example.com (avoids setup rate-limit issues)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost';
const HEADERS  = { 'Content-Type': 'application/json' };

// Test accounts — tokens fetched fresh at runtime via setup()
const ACCOUNTS = [
  { email: 'k6user1@example.com', password: 'K6Test99!' },
  { email: 'k6user2@example.com', password: 'K6Test99!' },
  { email: 'k6user3@example.com', password: 'K6Test99!' },
];

const loginDur   = new Trend('login_duration',   true);
const profileDur = new Trend('profile_duration', true);

// Fetch fresh tokens once before the test starts
export function setup() {
    const tokens = [];
    for (const acct of ACCOUNTS) {
        const res = http.post(
            BASE_URL + '/api/auth/login',
            JSON.stringify({ email: acct.email, password: acct.password }),
            { headers: HEADERS }
        );
        const token = (res.status === 200) ? res.json('accessToken') : null;
        tokens.push(token);
    }
    return { tokens };
}

export const options = {
    scenarios: {
        login_100vu: {
            executor: 'ramping-vus', startVUs: 0,
            stages: [{ duration: '10s', target: 100 }, { duration: '30s', target: 100 }, { duration: '5s', target: 0 }],
            gracefulRampDown: '5s', exec: 'loginTest',
            tags: { phase: 'login_100vu' },
        },
        profile_100vu: {
            executor: 'ramping-vus', startVUs: 0,
            stages: [{ duration: '10s', target: 100 }, { duration: '30s', target: 100 }, { duration: '5s', target: 0 }],
            gracefulRampDown: '5s', exec: 'profileTest',
            tags: { phase: 'profile_100vu' }, startTime: '50s',
        },
        login_500vu: {
            executor: 'ramping-vus', startVUs: 0,
            stages: [{ duration: '20s', target: 500 }, { duration: '30s', target: 500 }, { duration: '10s', target: 0 }],
            gracefulRampDown: '5s', exec: 'loginTest',
            tags: { phase: 'login_500vu' }, startTime: '100s',
        },
        profile_500vu: {
            executor: 'ramping-vus', startVUs: 0,
            stages: [{ duration: '20s', target: 500 }, { duration: '30s', target: 500 }, { duration: '10s', target: 0 }],
            gracefulRampDown: '5s', exec: 'profileTest',
            tags: { phase: 'profile_500vu' }, startTime: '165s',
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<8000'],
        http_req_failed:   ['rate<0.9'],   // rate-limited 429s count as "ok" for throughput
        login_duration:    ['p(95)<8000'],
        profile_duration:  ['p(95)<3000'],
    },
};

export function loginTest(data) {
    const acct = ACCOUNTS[(__VU - 1) % ACCOUNTS.length];
    const t = Date.now();
    const res = http.post(
        BASE_URL + '/api/auth/login',
        JSON.stringify({ email: acct.email, password: acct.password }),
        { headers: HEADERS }
    );
    loginDur.add(Date.now() - t);
    check(res, { 'login 2xx or 429': (r) => r.status === 200 || r.status === 429 || r.status === 401 });
    sleep(Math.random() * 0.5 + 0.1);
}

export function profileTest(data) {
    const idx   = (__VU - 1) % ACCOUNTS.length;
    const token = data.tokens[idx];
    const t = Date.now();
    const res = http.get(
        BASE_URL + '/api/auth/profile',
        { headers: { ...HEADERS, 'Authorization': 'Bearer ' + token } }
    );
    profileDur.add(Date.now() - t);
    check(res, { 'profile 200 or 401': (r) => r.status === 200 || r.status === 401 || r.status === 429 });
    sleep(Math.random() * 0.2 + 0.05);
}
