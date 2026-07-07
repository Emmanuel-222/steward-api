const AppError = require('../utils/AppError')

function errorHandler(err, req, res, _next) {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
        })
    }

    if (err.name === 'SyntaxError' && err.status === 400) {
        return res.status(400).json({
            success: false,
            message: 'Invalid JSON in request body',
        })
    }

    if (err.code === 'P2002') {
        return res.status(409).json({
            success: false,
            message: 'A record with that value already exists',
        })
    }

    console.error('Unhandled error:', err)
    return res.status(500).json({
        success: false,
        message: 'Internal server error',
    })
}

module.exports = errorHandler
