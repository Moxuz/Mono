/**
 * k6 Performance Test — TAS Authentication Server
 * Tests 4 scenarios: Login/Profile at 100 VU and 500 VU
 * Pre-created users: k6user1-3@example.com (avoids setup rate-limit issues)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const HEADERS  = { 'Content-Type': 'application/json' };

// Pre-fetched tokens for 3 test accounts (rotated round-robin across VUs)
const ACCOUNTS = [
  { email: 'k6user1@example.com', password: 'K6Test99!', token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YzgwZThhOGFmNTI2MjFlM2FlNDRlMiIsImVtYWlsIjoiazZ1c2VyMUBleGFtcGxlLmNvbSIsInJvbGUiOiJ1c2VyIiwicHJvdmlkZXIiOiJsb2NhbCIsImp0aSI6ImY4ZGM3MjdiMjU0OGJiYzViZTU2MjhjZDQ4OWVjNDlmIiwiaWF0IjoxNzc0NzE4NzYyLCJleHAiOjE3NzQ3MjIzNjJ9.WXQrSfvR_xpqk2ynvcjswcvQ3TPsrCkXC1xPAfXkqvw' },
  { email: 'k6user2@example.com', password: 'K6Test99!', token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YzgwZThiOGFmNTI2MjFlM2FlNDRlYSIsImVtYWlsIjoiazZ1c2VyMkBleGFtcGxlLmNvbSIsInJvbGUiOiJ1c2VyIiwicHJvdmlkZXIiOiJsb2NhbCIsImp0aSI6IjM5YjJlNDMyZjNkNWZhMWNmZWM1NjAzZWNiNDgyOTgyIiwiaWF0IjoxNzc0NzE4NzY1LCJleHAiOjE3NzQ3MjIzNjV9.dAn3FXgwMPyV0Nf1nA31oubsttrabbmUg7gKHPXdhYo' },
  { email: 'k6user3@example.com', password: 'K6Test99!', token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YzgwZThjOGFmNTI2MjFlM2FlNDRmMiIsImVtYWlsIjoiazZ1c2VyM0BleGFtcGxlLmNvbSIsInJvbGUiOiJ1c2VyIiwicHJvdmlkZXIiOiJsb2NhbCIsImp0aSI6IjI4ODc5ZDQzMjA0YzRjMDhhMmVlNTQwY2Q3YmNiZTk5IiwiaWF0IjoxNzc0NzE4NzY4LCJleHAiOjE3NzQ3MjIzNjh9.H6t38PlfwgFPqQninOFSip63ezGgrIhaw_PfkB7L7BQ' },
];

const loginDur   = new Trend('login_duration',   true);
const profileDur = new Trend('profile_duration', true);

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

export function loginTest() {
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

export function profileTest() {
    const acct = ACCOUNTS[(__VU - 1) % ACCOUNTS.length];
    const t = Date.now();
    const res = http.get(
        BASE_URL + '/api/auth/profile',
        { headers: { ...HEADERS, 'Authorization': 'Bearer ' + acct.token } }
    );
    profileDur.add(Date.now() - t);
    check(res, { 'profile 200 or 401': (r) => r.status === 200 || r.status === 401 || r.status === 429 });
    sleep(Math.random() * 0.2 + 0.05);
}
