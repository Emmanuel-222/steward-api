require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
const swaggerUi = require('swagger-ui-express')
const swaggerSpec = require('./swagger')
const notFound = require('./middleware/notFound')
const errorHandler = require('./middleware/errorHandler')

const app = express()
app.use(helmet())
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
app.use(express.json({ limit: '1mb' }))
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : []

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(null, false)
  },
  credentials: true,
}))

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Import for cron jobs
const autoMarkAbsent = require('./cron/autoAbsent')
const cleanupTokens = require('./cron/cleanupTokens')

// Import of routes files
const authRoutes = require('./routes/auth')
const userRoutes = require('./routes/users')
const meetingRoutes = require('./routes/meetings')
const attendanceRoutes = require('./routes/attendance')
const checkInRoutes = require('./routes/checkIn')

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))
app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.send(swaggerSpec)
})

app.use('/auth', loginLimiter, authRoutes)
app.use('/users', userRoutes)
app.use('/meetings', meetingRoutes)
app.use('/attendance', attendanceRoutes)
app.use('/attendance', checkInRoutes)

app.use(notFound)
app.use(errorHandler)

const { disconnect } = require('./prisma')

const server = app.listen(3000, () => {
    console.log('Steward API running on http://localhost:3000')
    console.log('Swagger docs available at http://localhost:3000/api-docs')
})

autoMarkAbsent()
cleanupTokens()

const SHUTDOWN_TIMEOUT = 5000

async function shutdown(signal) {
    console.log(`\n${signal} received — shutting down gracefully...`)

    const forceExit = setTimeout(() => {
        console.error(`Shutdown timed out after ${SHUTDOWN_TIMEOUT}ms — force exiting`)
        process.exit(1)
    }, SHUTDOWN_TIMEOUT)
    forceExit.unref()

    try {
        if (server.listening) {
            await new Promise((resolve, reject) => {
                server.close((err) => (err ? reject(err) : resolve()))
            })
        }
        await disconnect()
        clearTimeout(forceExit)
        console.log('Disconnected. Goodbye.')
        process.exit(0)
    } catch (err) {
        console.error('Shutdown error:', err)
        clearTimeout(forceExit)
        process.exit(1)
    }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
