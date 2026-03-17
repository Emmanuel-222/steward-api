const express = require('express')
const router = express.Router()
const authenticate = require('../middleware/authenticate')
const isAdmin = require('../middleware/isAdmin')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

router.get('/', authenticate, async (req, res) => {
    const meetings = await prisma.meeting.findMany({
        orderBy: { date: 'desc' }
    })
    res.json(meetings)
})

router.get('/:id', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    const meeting = await prisma.meeting.findUnique({
        where: { id }
    })
    if (!meeting) return res.status(404).json({ message: "Meeting not found" })
    res.json(meeting)
})

router.post('/', authenticate, isAdmin, async (req, res) => {
    const { type, date, startTime, cutoffTime } = req.body
    if (!type || !date || !startTime || !cutoffTime) return res.status(400).json({ message: "All fields are required" })
    const newMeeting = await prisma.meeting.create({
        data: {
            type,
            date: new Date(date),  //save as a date of the same date type of the db, so that no matter the date from the request body we always save the proper date needed on the db.
            startTime,
            cutoffTime
        }
    })
    res.status(201).json({ message: "Meeting created successfully", meetingId: newMeeting })
})

router.patch('/:id', authenticate, isAdmin, async (req, res) => {
    const id = Number(req.params.id)
    const { type, date, startTime, cutoffTime } = req.body
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
            startTime: startTime || meeting.startTime
        }
    })
    res.json({ message: "Meeting updated successfully!", updatedMeeting })
})

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