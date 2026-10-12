// Check if the person is authorised.

const isAdmin = (req, res, next) => {
    if (req.user.role?.toLowerCase() !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    next()
}

module.exports = isAdmin