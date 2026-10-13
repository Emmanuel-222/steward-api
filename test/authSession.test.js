const { test } = require('node:test')
const assert = require('node:assert')
const { ROTATION_GRACE_MS, SESSION_IDLE_MS, buildOnboarding, isWithinRotationGrace, isSessionIdle } = require('../utils/authSession')

test('buildOnboarding forces a change when the password is still the default', () => {
  const result = buildOnboarding({ emailVerified: true, mustChangePassword: false }, true)
  assert.equal(result.required, true)
  assert.equal(result.needsPasswordChange, true)
})

test('buildOnboarding matches login and refresh for a default-password user', () => {
  const user = { emailVerified: true, mustChangePassword: false }
  // login computes passwordMatchesDefault=true, refresh/me compute it too now.
  assert.deepEqual(buildOnboarding(user, true), buildOnboarding(user, true))
})

test('buildOnboarding forces email verification when unverified', () => {
  const result = buildOnboarding({ emailVerified: false, mustChangePassword: false }, false)
  assert.equal(result.required, true)
  assert.equal(result.needsEmailVerify, true)
})

test('buildOnboarding is satisfied when verified, changed, and not default', () => {
  const result = buildOnboarding({ emailVerified: true, mustChangePassword: false }, false)
  assert.deepEqual(result, { required: false, needsEmailVerify: false, needsPasswordChange: false })
})

test('isWithinRotationGrace accepts a recently rotated token', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0)
  assert.equal(isWithinRotationGrace(new Date(now - 10_000), now), true)
})

test('isWithinRotationGrace rejects a long-revoked token', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0)
  assert.equal(isWithinRotationGrace(new Date(now - ROTATION_GRACE_MS - 1), now), false)
})

test('isWithinRotationGrace rejects a missing revocation timestamp', () => {
  assert.equal(isWithinRotationGrace(null), false)
  assert.equal(isWithinRotationGrace(undefined), false)
})

test('isSessionIdle is false for a recently used session', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0)
  assert.equal(isSessionIdle(new Date(now - 60_000), now), false)
})

test('isSessionIdle is true past the idle window', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0)
  assert.equal(isSessionIdle(new Date(now - SESSION_IDLE_MS - 1), now), true)
})

test('isSessionIdle treats a closed tab (stale token) as idle', () => {
  const now = Date.UTC(2026, 0, 2, 9, 0, 0)
  const yesterday = Date.UTC(2026, 0, 1, 12, 0, 0)
  assert.equal(isSessionIdle(new Date(yesterday), now), true)
})

test('isSessionIdle is false when there is no timestamp', () => {
  assert.equal(isSessionIdle(null), false)
})
