const { test } = require('node:test')
const assert = require('node:assert')
const { verifyOrigin, isOriginAllowed } = require('../middleware/verifyOrigin')

const allow = ['http://localhost:5173', 'https://dc-attendance-gray.vercel.app']

test('isOriginAllowed accepts a listed origin', () => {
  assert.equal(isOriginAllowed('http://localhost:5173', 'localhost:3000', allow), true)
})

test('isOriginAllowed accepts a same-origin request', () => {
  assert.equal(isOriginAllowed('http://api.example.com', 'api.example.com', allow), true)
})

test('isOriginAllowed rejects an unlisted origin', () => {
  assert.equal(isOriginAllowed('http://evil.example.com', 'api.example.com', allow), false)
})

test('isOriginAllowed rejects a malformed origin', () => {
  assert.equal(isOriginAllowed('not a url', 'api.example.com', allow), false)
})

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this },
  }
}

test('verifyOrigin blocks a state-changing request from an untrusted origin', () => {
  const req = { method: 'POST', headers: { origin: 'http://evil.example.com', host: 'api.example.com' } }
  const res = mockRes()
  let nextCalled = false
  verifyOrigin(req, res, () => { nextCalled = true })
  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 403)
  assert.equal(res.body.success, false)
})

test('verifyOrigin allows safe methods regardless of origin', () => {
  const req = { method: 'GET', headers: { origin: 'http://evil.example.com', host: 'api.example.com' } }
  const res = mockRes()
  let nextCalled = false
  verifyOrigin(req, res, () => { nextCalled = true })
  assert.equal(nextCalled, true)
})

test('verifyOrigin allows requests with no origin (non-browser clients)', () => {
  const req = { method: 'POST', headers: { host: 'api.example.com' } }
  const res = mockRes()
  let nextCalled = false
  verifyOrigin(req, res, () => { nextCalled = true })
  assert.equal(nextCalled, true)
})

test('verifyOrigin allows a state-changing request from an allowlisted origin', () => {
  const previous = process.env.CORS_ORIGINS
  process.env.CORS_ORIGINS = 'http://localhost:5173'
  try {
    const req = { method: 'POST', headers: { origin: 'http://localhost:5173', host: 'localhost:3000' } }
    const res = mockRes()
    let nextCalled = false
    verifyOrigin(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
  } finally {
    if (previous === undefined) delete process.env.CORS_ORIGINS
    else process.env.CORS_ORIGINS = previous
  }
})
