const express = require('express')
const router = express.Router()
const { body } = require('express-validator')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const authenticate = require('../middleware/authenticate')
const isAdmin = require('../middleware/isAdmin')
const isAuthorized = require('../middleware/isAuthorized')
const { prisma } = require('../prisma')
const handleValidation = require('../middleware/validate')
const asyncHandler = require('../utils/asyncHandler')
const AppError = require('../utils/AppError')
const { success, created } = require('../utils/response')

const JWT_SECRET = process.env.JWT_SECRET
const QR_TOKEN_EXPIRY = '1h'

const meetingValidation = [
    body('title').trim().notEmpty().withMessage('Meeting title is required'),
    body('type').trim().notEmpty().withMessage('Meeting type is required'),
    body('date').isISO8601().withMessage('A valid date is required'),
    body('startTime').trim().notEmpty().withMessage('Start time is required'),
    body('cutoffTime').trim().notEmpty().withMessage('Cutoff time is required'),
    body('endTime').trim().notEmpty().withMessage('End time is required'),
    body('location').trim().notEmpty().withMessage('Location is required'),
    handleValidation,
]

/**
 * @swagger
 * /meetings:
 *   get:
 *     summary: Get all meetings
 *     tags: [Meetings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of meetings
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MeetingList'
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
    const page = req.query.page ? Math.max(1, parseInt(req.query.page)) : null;
    const limit = page ? Math.min(100, Math.max(1, parseInt(req.query.limit) || 20)) : null;
    const skip = page ? (page - 1) * limit : undefined;
    const take = page ? limit : undefined;

    const [meetings, total] = await Promise.all([
        prisma.meeting.findMany({
            skip,
            take,
            orderBy: { date: 'desc' },
            include: {
                attendance: {
                    select: { status: true }
                }
            }
        }),
        page ? prisma.meeting.count() : Promise.resolve(0),
    ])

    const meetingsWithCounts = meetings.map(meeting => {
        const presentCount = meeting.attendance.filter(a => a.status === 'present' || a.status === 'late').length
        const lateCount = meeting.attendance.filter(a => a.status === 'late').length
        const absentCount = meeting.attendance.filter(a => a.status === 'absent').length
        
        return {
            id: meeting.id,
            title: meeting.title,
            type: meeting.type,
            date: meeting.date,
            startTime: meeting.startTime,
            cutoffTime: meeting.cutoffTime,
            endTime: meeting.endTime,
            location: meeting.location,
            status: meeting.status,
            createdAt: meeting.createdAt,
            presentCount,
            lateCount,
            absentCount
        }
    })

    return success(res, {
        items: meetingsWithCounts,
        pagination: page ? { total, page, limit, totalPages: Math.ceil(total / limit) } : null,
    })
}))

/**
 * @swagger
 * /meetings/{id}:
 *   get:
 *     summary: Get a single meeting
 *     tags: [Meetings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Meeting details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Meeting'
 *       404:
 *         description: Meeting not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const meeting = await prisma.meeting.findUnique({
        where: { id },
        include: {
            attendance: {
                select: { status: true }
            }
        }
    })
    if (!meeting) throw new AppError("Meeting not found", 404)
    
    const presentCount = meeting.attendance.filter(a => a.status === 'present' || a.status === 'late').length
    const lateCount = meeting.attendance.filter(a => a.status === 'late').length
    const absentCount = meeting.attendance.filter(a => a.status === 'absent').length
    
    return success(res, {
        id: meeting.id,
        title: meeting.title,
        type: meeting.type,
        date: meeting.date,
        startTime: meeting.startTime,
        cutoffTime: meeting.cutoffTime,
        endTime: meeting.endTime,
        location: meeting.location,
        status: meeting.status,
        createdAt: meeting.createdAt,
        presentCount,
        lateCount,
        absentCount
    })
}))

/**
 * @swagger
 * /meetings:
 *   post:
 *     summary: Create a meeting
 *     tags: [Meetings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMeetingRequest'
 *     responses:
 *       201:
 *         description: Meeting created
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', authenticate, isAdmin, meetingValidation, asyncHandler(async (req, res) => {
    const { title, type, date, startTime, cutoffTime, location, endTime } = req.body
    const newMeeting = await prisma.meeting.create({
        data: {
            title,
            type,
            date: new Date(date),
            startTime,
            cutoffTime,
            endTime,
            location,
            status: 'Ongoing'
        }
    })
    return created(res, { meeting: newMeeting }, "Meeting created successfully")
}))

/**
 * @swagger
 * /meetings/{id}:
 *   patch:
 *     summary: Update a meeting
 *     tags: [Meetings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateMeetingRequest'
 *     responses:
 *       200:
 *         description: Meeting updated
 *       404:
 *         description: Meeting not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/:id', authenticate, isAdmin, asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const { title, type, date, startTime, cutoffTime, location, endTime, status } = req.body
    const meeting = await prisma.meeting.findUnique({
        where: { id }
    })
    if (!meeting) throw new AppError("Meeting not found", 404)
    const updatedMeeting = await prisma.meeting.update({
        where: { id },
        data: {
            title: title || meeting.title,
            type: type || meeting.type,
            date: date ? new Date(date) : meeting.date,
            cutoffTime: cutoffTime || meeting.cutoffTime,
            startTime: startTime || meeting.startTime,
            endTime: endTime || meeting.endTime,
            location: location || meeting.location,
            status: status || meeting.status
        }
    })
    return success(res, { updatedMeeting }, "Meeting updated successfully!")
}))

/**
 * @swagger
 * /meetings/{id}:
 *   delete:
 *     summary: Delete a meeting
 *     tags: [Meetings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Meeting deleted
 *       404:
 *         description: Meeting not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:id', authenticate, isAdmin, asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const meeting = await prisma.meeting.findUnique({
        where: { id }
    })
    if (!meeting) throw new AppError("Meeting not found", 404)
    await prisma.meeting.delete({
        where: { id }
    })
    return success(res, null, "Meeting deleted successfully")
}))

// Generate a signed QR check-in token for a meeting
router.get('/:id/qr-token', authenticate, isAuthorized(['admin', 'leader', 'pastor']), asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const meeting = await prisma.meeting.findUnique({
        where: { id }
    })
    if (!meeting) throw new AppError("Meeting not found", 404)

    const token = jwt.sign(
        {
            meetingId: meeting.id,
            purpose: 'check-in',
            nonce: crypto.randomUUID(),
        },
        JWT_SECRET,
        { expiresIn: QR_TOKEN_EXPIRY }
    )

    const baseUrl = process.env.CHECKIN_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173'
    const url = `${baseUrl}/check-in/${token}`

    return success(res, { token, url })
}))

module.exports = router
