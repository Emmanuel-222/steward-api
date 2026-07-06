require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const swaggerUi = require('swagger-ui-express')
const swaggerSpec = require('./swagger')

const app = express()
app.use(helmet())
app.use(express.json({ limit: '1mb' }))
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:4173']

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
  message: { message: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Import for cron job
const autoMarkAbsent = require('./cron/autoAbsent')

// Import of routes files
const authRoutes = require('./routes/auth')
const userRoutes = require('./routes/users')
const meetingRoutes = require('./routes/meetings')
const attendanceRoutes = require('./routes/attendance')

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))
app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.send(swaggerSpec)
})

app.use('/auth', loginLimiter, authRoutes)
app.use('/users', userRoutes)
app.use('/meetings', meetingRoutes)
app.use('/attendance', attendanceRoutes)

app.listen(3000, () => {
    console.log('Steward API running on http://localhost:3000')
    console.log('Swagger docs available at http://localhost:3000/api-docs')
})

autoMarkAbsent()
