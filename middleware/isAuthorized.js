/**
 * Middleware to check if the user has one of the allowed roles.
 * @param {string[]} allowedRoles - Array of roles that are authorized.
 */
const isAuthorized = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role?.toLowerCase())) {
            return res.status(403).json({ 
                message: `Unauthorized access. Required roles: ${allowedRoles.join(', ')}` 
            })
        }
        next()
    }
}

module.exports = isAuthorized
