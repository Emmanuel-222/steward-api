require('dotenv').config()  //always config your file.
const express = require('express')
const cors = require('cors')

const app = express()
app.use(express.json())
app.use(cors())

// Import for cron job
const autoMarkAbsent = require('./cron/autoAbsent')

// Import of routes files
const authRoutes = require('./routes/auth')
const userRoutes = require('./routes/users')
const meetingRoutes = require('./routes/meetings')
const attendanceRoutes = require('./routes/attendance')

// mini apps which stands for services(routes)
app.use('/auth', authRoutes)
app.use('/users', userRoutes)
app.use('/meetings', meetingRoutes)
app.use('/attendance', attendanceRoutes)



app.listen(3000, () => {
    console.log('Steward API running on http://localhost:3000')
})

autoMarkAbsent()