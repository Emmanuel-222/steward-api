const ROTATION_GRACE_MS = 60 * 1000

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

module.exports = { ROTATION_GRACE_MS, buildOnboarding, isWithinRotationGrace }
