const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const { body } = require('express-validator')
const rateLimit = require('express-rate-limit')
const { prisma } = require('../prisma')
const handleValidation = require('../middleware/validate')
const asyncHandler = require('../utils/asyncHandler')
const AppError = require('../utils/AppError')
const { success } = require('../utils/response')

const JWT_SECRET = process.env.JWT_SECRET
const CACHE_TTL = 5 * 60 * 1000
const checkInCache = new Map()

setInterval(() => {
    const now = Date.now()
    for (const [key, ttl] of checkInCache.entries()) {
        if (ttl < now) checkInCache.delete(key)
    }
}, 60 * 1000)

function parseMeetingTime(meeting, timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null
    const match = timeStr.trim().match(/(\d+):(\d+)\s*(AM|PM)/i)
    if (!match) return null
    let hours = parseInt(match[1], 10)
    const minutes = parseInt(match[2], 10)
    const modifier = match[3].toUpperCase()
    if (modifier === 'PM' && hours < 12) hours += 12
    if (modifier === 'AM' && hours === 12) hours = 0
    const base = new Date(meeting.date)
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes, 0, 0)
}

function crossesMidnight(meeting) {
    if (!meeting.startTime || !meeting.endTime) return false
    const start = parseMeetingTime(meeting, meeting.startTime)
    const end = parseMeetingTime(meeting, meeting.endTime)
    if (!start || !end) return false
    return end < start
}

function getMeetingCutoff(meeting) {
    const cutoff = parseMeetingTime(meeting, meeting.cutoffTime)
    if (!cutoff) return null
    if (crossesMidnight(meeting)) {
        cutoff.setDate(cutoff.getDate() + 1)
    }
    return cutoff
}

const checkInLimiter = rateLimit({
    windowMs: 30 * 1000,
    max: 50,
    message: { success: false, message: 'Too many check-in attempts. Try again in 30 seconds.' },
    standardHeaders: true,
    legacyHeaders: false,
})

const checkInValidation = [
    body('token').trim().notEmpty().withMessage('Token is required'),
    body('email').isEmail().withMessage('A valid email is required'),
    handleValidation,
]

router.post('/check-in', checkInLimiter, checkInValidation, asyncHandler(async (req, res) => {
    const { token, email } = req.body
    const normalizedEmail = email.toLowerCase().trim()

    let payload
    try {
        payload = jwt.verify(token, JWT_SECRET)
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            throw new AppError('This QR code has expired. Ask the meeting admin for a new one.', 401)
        }
        throw new AppError('Invalid QR code. Please ask the admin for a new one.', 401)
    }

    if (payload.purpose !== 'check-in') {
        throw new AppError('Invalid QR code. Please ask the admin for a new one.', 401)
    }

    const meetingId = Number(payload.meetingId)
    if (!meetingId || Number.isNaN(meetingId)) {
        throw new AppError('Invalid QR code. Please ask the admin for a new one.', 401)
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user) {
        throw new AppError('No steward found with that email. Try a different email.', 404)
    }

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } })
    if (!meeting) {
        throw new AppError('Meeting not found.', 404)
    }

    if (meeting.status === 'Finalized') {
        throw new AppError('This meeting is closed. Check-in is no longer available.', 400)
    }

    const cacheKey = `${normalizedEmail}:${meeting.id}`

    if (checkInCache.has(cacheKey)) {
        return success(res, {
            stewardName: user.fullName,
            isDuplicate: true,
        }, `You're already checked in, ${user.fullName}!`)
    }

    const existing = await prisma.attendance.findUnique({
        where: {
            userId_meetingId: {
                userId: user.id,
                meetingId: meeting.id
            }
        }
    })

    if (existing) {
        checkInCache.set(cacheKey, Date.now() + CACHE_TTL)
        return success(res, {
            stewardName: user.fullName,
            isDuplicate: true,
        }, `You're already checked in, ${user.fullName}!`)
    }

    const cutoff = getMeetingCutoff(meeting)
    let status = 'present'
    if (cutoff && new Date() > cutoff) {
        status = 'late'
    }

    await prisma.attendance.create({
        data: {
            userId: user.id,
            meetingId: meeting.id,
            status,
            markedAt: new Date()
        }
    })

    checkInCache.set(cacheKey, Date.now() + CACHE_TTL)

    return success(res, {
        stewardName: user.fullName,
        isDuplicate: false,
        status,
    }, status === 'late'
        ? `You're checked in but late, ${user.fullName}.`
        : `You're checked in, ${user.fullName}!`)
}))

module.exports = router
