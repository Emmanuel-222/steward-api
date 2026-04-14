const express = require('express')
const router = express.Router()
const authenticate = require('../middleware/authenticate')
const isAdmin = require('../middleware/isAdmin')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

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
        orderBy: { date: 'desc' }
    })
    res.json(meetings)
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
        where: { id }
    })
    if (!meeting) return res.status(404).json({ message: "Meeting not found" })
    res.json(meeting)
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
router.post('/', authenticate, isAdmin, async (req, res) => {
    const { type, date, startTime, cutoffTime, location } = req.body
    if (!type || !date || !startTime || !cutoffTime || !location) return res.status(400).json({ message: "All fields are required" })
    const newMeeting = await prisma.meeting.create({
        data: {
            type,
            date: new Date(date),  //save as a date of the same date type of the db, so that no matter the date from the request body we always save the proper date needed on the db.
            startTime,
            cutoffTime,
            location
        }
    })
    res.status(201).json({ message: "Meeting created successfully", meetingId: newMeeting })
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
    const { type, date, startTime, cutoffTime, location } = req.body
    const meeting = await prisma.meeting.findUnique({
        where: { id }
    })
    if (!meeting) return res.status(404).json({ message: "Meeting not found" })
    const updatedMeeting = await prisma.meeting.update({
        where: { id },
        data: {
            type: type || meeting.type,
            date: date ? new Date(date) : meeting.date,
            cutoffTime: cutoffTime || meeting.cutoffTime,
            startTime: startTime || meeting.startTime,
            location: location || meeting.location
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
