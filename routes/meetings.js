const express = require('express')
const router = express.Router()
const { body } = require('express-validator')
const authenticate = require('../middleware/authenticate')
const isAdmin = require('../middleware/isAdmin')
const { PrismaClient } = require('@prisma/client')
const handleValidation = require('../middleware/validate')

const prisma = new PrismaClient()

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
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Meeting'
 */
router.get('/', authenticate, async (req, res) => {
    const meetings = await prisma.meeting.findMany({
        orderBy: { date: 'desc' },
        include: {
            attendance: {
                select: { status: true }
            }
        }
    })

    const meetingsWithCounts = meetings.map(meeting => {
        const presentCount = meeting.attendance.filter(a => a.status === 'present' || a.status === 'late').length
        const lateCount = meeting.attendance.filter(a => a.status === 'late').length
        const absentCount = meeting.attendance.filter(a => a.status === 'absent').length
        
        return {
            id: meeting.id,
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

    res.json(meetingsWithCounts)
})

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
router.get('/:id', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    const meeting = await prisma.meeting.findUnique({
        where: { id },
        include: {
            attendance: {
                select: { status: true }
            }
        }
    })
    if (!meeting) return res.status(404).json({ message: "Meeting not found" })
    
    const presentCount = meeting.attendance.filter(a => a.status === 'present' || a.status === 'late').length
    const lateCount = meeting.attendance.filter(a => a.status === 'late').length
    const absentCount = meeting.attendance.filter(a => a.status === 'absent').length
    
    res.json({
        id: meeting.id,
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
})

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
router.post('/', authenticate, isAdmin, meetingValidation, async (req, res) => {
    const { title, type, date, startTime, cutoffTime, location, endTime } = req.body
    const newMeeting = await prisma.meeting.create({
        data: {
            title,
            type,
            date: new Date(date),  //save as a date of the same date type of the db, so that no matter the date from the request body we always save the proper date needed on the db.
            startTime,
            cutoffTime,
            endTime,
            location,
            status: 'Ongoing' // Default status for new meetings
        }
    })
    res.status(201).json({ message: "Meeting created successfully", meeting: newMeeting })
})

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
router.patch('/:id', authenticate, isAdmin, async (req, res) => {
    const id = Number(req.params.id)
    const { title, type, date, startTime, cutoffTime, location, endTime, status } = req.body
    const meeting = await prisma.meeting.findUnique({
        where: { id }
    })
    if (!meeting) return res.status(404).json({ message: "Meeting not found" })
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
    res.json({ message: "Meeting updated successfully!", updatedMeeting })
})

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
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
    const id = Number(req.params.id)
    const meeting = await prisma.meeting.findUnique({
        where: { id }
    })
    if (!meeting) return res.status(404).json({ message: "Meeting not found" })
    await prisma.meeting.delete({
        where: { id }
    })
    res.json({ message: "Meeting deleted successfully" })
})

module.exports = router
