const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET

// Check if the person is authenticated.

const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization']
    
    if (!authHeader) {
        return res.status(401).json({ message: 'No token provided' })
    }

    const token = authHeader.split(' ')[1]

    try {
        const decoded = jwt.verify(token, JWT_SECRET)
        req.user = decoded
        next()
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired, please login again' })
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: 'Invalid token' })
        }
        return res.status(500).json({ message: 'Something went wrong' })
    }
}

module.exports = authenticate;