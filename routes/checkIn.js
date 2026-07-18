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

const checkInLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many check-in attempts. Try again in 15 minutes.' },
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

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
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

    const cacheKey = `${user.id}:${meeting.id}`
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

    await prisma.attendance.create({
        data: {
            userId: user.id,
            meetingId: meeting.id,
            status: 'present',
            markedAt: new Date()
        }
    })

    checkInCache.set(cacheKey, Date.now() + CACHE_TTL)

    return success(res, {
        stewardName: user.fullName,
        isDuplicate: false,
    }, `You're checked in, ${user.fullName}!`)
}))

module.exports = router
