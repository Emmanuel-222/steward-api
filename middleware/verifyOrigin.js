const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function allowedOrigins() {
    return (process.env.CORS_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
}

// An origin is allowed if it is on the allowlist, or it matches the request host
// (i.e. the frontend is served from the same origin as the API).
function isOriginAllowed(origin, host, allowlist) {
    if (allowlist.includes(origin)) return true
    try {
        return new URL(origin).host === host
    } catch {
        return false
    }
}

// CSRF guard: reject state-changing requests from origins we don't trust. The
// refresh cookie is SameSite=None (cross-site FE/API), so SameSite can't help us.
function verifyOrigin(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next()

    const origin = req.headers.origin
    // Browsers always send Origin on cross-origin state-changing requests; a
    // missing Origin means a non-browser client (curl, tests, server-to-server).
    if (!origin) return next()

    if (isOriginAllowed(origin, req.headers.host, allowedOrigins())) return next()

    return res.status(403).json({ success: false, message: 'Request blocked: origin not allowed' })
}

module.exports = { verifyOrigin, isOriginAllowed, allowedOrigins, SAFE_METHODS }
