const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const { body } = require('express-validator')
const { prisma } = require('../prisma')
const handleValidation = require('../middleware/validate')
const asyncHandler = require('../utils/asyncHandler')
const AppError = require('../utils/AppError')
const { success } = require('../utils/response')

const JWT_SECRET = process.env.JWT_SECRET
const QR_TOKEN_EXPIRY = '1h'

const checkInValidation = [
    body('token').trim().notEmpty().withMessage('Token is required'),
    body('email').isEmail().withMessage('A valid email is required'),
    handleValidation,
]

router.post('/check-in', checkInValidation, asyncHandler(async (req, res) => {
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

    await prisma.attendance.upsert({
        where: {
            userId_meetingId: {
                userId: user.id,
                meetingId: meeting.id
            }
        },
        update: {
            status: 'present',
            markedAt: new Date()
        },
        create: {
            userId: user.id,
            meetingId: meeting.id,
            status: 'present',
            markedAt: new Date()
        }
    })

    return success(res, {
        stewardName: user.fullName,
    }, `You're checked in, ${user.fullName}!`)
}))

module.exports = router
