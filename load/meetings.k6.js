// k6 load test for the Steward API.
//
// Run (PowerShell):
//   $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + $env:Path
//   k6 run --env BASE_URL=https://steward-api-nlga.onrender.com `
//          --env STEWARD_EMAIL=admin@steward.com `
//          --env STEWARD_PASSWORD='your-password' `
//          load/meetings.k6.js
//
// Notes:
// - Logs in ONCE in setup() and shares the token, so the login rate limit
//   (10 / 15 min) is never hit.
// - Targets read-only endpoints. Point BASE_URL at staging/local for real load;
//   do NOT run heavy load against production (writes would corrupt attendance).

import http from 'k6/http'
import { check, sleep, fail } from 'k6'

const BASE = __ENV.BASE_URL || 'https://steward-api-nlga.onrender.com'
const EMAIL = __ENV.STEWARD_EMAIL
const PASSWORD = __ENV.STEWARD_PASSWORD

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 3 }, // ramp up to 3 virtual users
        { duration: '15s', target: 3 }, // hold
        { duration: '5s', target: 0 }, // ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% of requests under 1s
    http_req_failed: ['rate<0.05'], // <5% failed
    checks: ['rate>0.99'], // 99% of checks pass
  },
}

export function setup() {
  if (!EMAIL || !PASSWORD) {
    fail('Set STEWARD_EMAIL and STEWARD_PASSWORD as --env vars')
  }
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  )
  const body = res.json()
  const token = body && body.data && body.data.token
  if (!token) {
    fail(`Login failed (${res.status}): ${res.body}`)
  }
  return { token }
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}` }

  const meetings = http.get(`${BASE}/meetings`, { headers })
  check(meetings, { 'GET /meetings is 200': (r) => r.status === 200 })

  const users = http.get(`${BASE}/users`, { headers })
  check(users, { 'GET /users is 200': (r) => r.status === 200 })

  sleep(1)
}
