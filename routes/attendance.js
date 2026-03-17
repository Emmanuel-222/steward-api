const express = require('express')
const router = express.Router()
const authenticate = require('../middleware/authenticate')
const isAdmin = require('../middleware/isAdmin')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// Mark a user as present 
router.post('/', authenticate, isAdmin, async (req, res) => {
    const { userId, meetingId } = req.body
    if (!userId || !meetingId) return res.status(400).json({ message: 'All fields are required!' })
    // check if user exist  
    const existingUser = await prisma.user.findUnique({ where: { id: Number(userId) } })
    if (!existingUser) return res.status(404).json({ message: 'User not found' })
    //check if meeting exist
    const meeting = await prisma.meeting.findUnique({ where: { id: Number(meetingId) } })
    if (!meeting) return res.status(404).json({ message: "Meeting not found" })

    // Check if this attendance match any on our database
    const existingAttendance = await prisma.attendance.findFirst({
        where: {
            userId: Number(userId),
            meetingId: Number(meetingId)
        }
    })
    if (existingAttendance) return res.status(400).json({ message: 'Attendance already marked for this user' })

    // mark the user present for this specific meeting.
    const attendance = await prisma.attendance.create({
        data: {
            userId: Number(userId),
            meetingId: Number(meetingId),
            markedAt: new Date(),
            status: "present",
        }
    })
    res.status(201).json({ message: "Attendance marked as present", attendance })
})

// Get attendance for a specific meeting
router.get('/meeting/:meetingId', authenticate, isAdmin, async (req, res) => {
    const meetingId = Number(req.params.meetingId)
    const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId }
    })
    if (!meeting) return res.status(404).json({ message: "Meeting not found" })
    const attendance = await prisma.attendance.findMany({  // findFirst looks for the first attendance with the meeting id we have provided 
        where: { meetingId },
        include: {
            user: {
                select: {
                    id: true,
                    fullName: true,
                    department: true,
                    role: true
                }
            }
        }
    })
    res.json({
        meeting,
        totalPresent: attendance.filter(markedPresent => markedPresent.status === 'present').length,
        totalAbsent: attendance.filter(markedAbsent => markedAbsent.status === 'absent').length,
        attendance
    })
})

// Get attendance of specific user 
router.get('/user/:userId', authenticate, isAdmin, async (req, res) => {
    const userId = Number(req.params.userId)
    const user = await prisma.user.findUnique({
        where: {
            id: userId
        },
        select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            department: true,
            role: true,
            createdAt: true
        }
    })
    if (!user) return res.status(404).json({ message: "User not found" })
    const attendance = await prisma.attendance.findMany({  // findMany looks for all the userid matching ours on the attendance
        where: { userId },
        include: {
            meeting: true
        },
        orderBy: { createdAt: 'desc' }
    })
    const total = attendance.length
    const present = attendance.filter(markedPresent => markedPresent.status === 'present').length
    const absent = attendance.filter(markedAbsent => markedAbsent.status === 'absent').length
    res.json({
        user,
        summary: { total, present, absent },
        records: attendance
    })
})
module.exports = router