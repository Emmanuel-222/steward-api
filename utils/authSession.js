const ROTATION_GRACE_MS = 60 * 1000
const SESSION_IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES || 30)
const SESSION_IDLE_MS = SESSION_IDLE_MINUTES * 60 * 1000

// Whether a user still needs to complete onboarding. The default-password check
// must be supplied by every caller (login, refresh, /me) or a reload can skip
// the forced password change.
function buildOnboarding(user, passwordMatchesDefault) {
    const needsEmailVerify = !user.emailVerified
    const needsPasswordChange = Boolean(user.mustChangePassword) || Boolean(passwordMatchesDefault)
    return {
        required: needsEmailVerify || needsPasswordChange,
        needsEmailVerify,
        needsPasswordChange,
    }
}

// A refresh token revoked by rotation moments ago is a concurrent refresh
// (e.g. another tab), not a stolen token.
function isWithinRotationGrace(revokedAt, now = Date.now()) {
    if (!revokedAt) return false
    return now - new Date(revokedAt).getTime() < ROTATION_GRACE_MS
}

// A session is idle if nothing has used its refresh token for the idle window
// (the app was left open, or the tab was closed).
function isSessionIdle(lastUsedAt, now = Date.now(), idleMs = SESSION_IDLE_MS) {
    if (!lastUsedAt) return false
    return now - new Date(lastUsedAt).getTime() > idleMs
}

module.exports = {
    ROTATION_GRACE_MS,
    SESSION_IDLE_MINUTES,
    SESSION_IDLE_MS,
    buildOnboarding,
    isWithinRotationGrace,
    isSessionIdle,
}
