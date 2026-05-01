const express = require('express')
const router = express.Router()
const authenticate = require('../middleware/authenticate')
const isAdmin = require('../middleware/isAdmin')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// Mark a user as present/absent for a meeting
/**
 * @swagger
 * /attendance:
 *   post:
 *     summary: Mark a user as present or absent for a meeting
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MarkAttendanceRequest'
 *     responses:
 *       201:
 *         description: Attendance marked successfully
 *       200:
 *         description: Attendance updated successfully
 *       400:
 *         description: Validation failed
 *       404:
 *         description: User or meeting not found
 */
router.post('/', authenticate, isAdmin, async (req, res) => {
    try {
        const { userId, meetingId, status } = req.body
        if (!userId || !meetingId) return res.status(400).json({ message: 'All fields are required!' })
        
        // check if user exist  
        const existingUser = await prisma.user.findUnique({ where: { id: Number(userId) } })
        if (!existingUser) return res.status(404).json({ message: 'User not found' })
        
        //check if meeting exist
        const meeting = await prisma.meeting.findUnique({ where: { id: Number(meetingId) } })
        if (!meeting) return res.status(404).json({ message: "Meeting not found" })

        // check if it's late
        let finalStatus = status || "present"
        if (finalStatus === "present") {
            const trimmedTime = meeting.cutoffTime.trim();
            const timeMatch = trimmedTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
            
            if (timeMatch) {
                let [_, h, m, modifier] = timeMatch;
                let hours = parseInt(h, 10);
                const minutes = parseInt(m, 10);
                
                if (modifier.toUpperCase() === 'PM' && hours < 12) hours += 12;
                if (modifier.toUpperCase() === 'AM' && hours === 12) hours = 0;

                const cutoff = new Date(meeting.date);
                cutoff.setHours(hours, minutes, 0, 0);

                if (new Date() > cutoff) {
                finalStatus = "late"
            }
          }
        }

        // Use upsert to create or update attendance status
        const attendance = await prisma.attendance.upsert({
            where: {
                userId_meetingId: {
                    userId: Number(userId),
                    meetingId: Number(meetingId)
                }
            },
            update: {
                status: finalStatus,
                markedAt: new Date()
            },
            create: {
                userId: Number(userId),
                meetingId: Number(meetingId),
                status: finalStatus,
                markedAt: new Date()
            }
        })

        const statusCode = attendance.createdAt === attendance.updatedAt ? 201 : 200;
        res.status(statusCode).json({ 
            message: `Steward marked as ${finalStatus}`, 
            attendance 
        })
    } catch (error) {
        console.error('Mark attendance error:', error);
        res.status(500).json({ message: "Internal server error" });
    }
})

// Get attendance for a specific meeting
router.get('/meeting/:meetingId', authenticate, isAdmin, async (req, res) => {
    const meetingId = Number(req.params.meetingId)
    const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId }
    })
    if (!meeting) return res.status(404).json({ message: "Meeting not found" })
    const attendance = await prisma.attendance.findMany({
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
        totalPresent: attendance.filter(a => a.status === 'present' || a.status === 'late').length,
        totalLate: attendance.filter(a => a.status === 'late').length,
        totalAbsent: attendance.filter(a => a.status === 'absent').length,
        attendance
    })
})

// Get attendance of specific user 
router.get('/user/:userId', authenticate, isAdmin, async (req, res) => {
    const userId = Number(req.params.userId)
    const user = await prisma.user.findUnique({ where: { id: userId },
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
    const attendance = await prisma.attendance.findMany({
        where: { userId },
        include: { meeting: true },
        orderBy: { createdAt: 'desc' }
    })
    const total = attendance.length
    const present = attendance.filter(a => a.status === 'present' || a.status === 'late').length
    const late = attendance.filter(a => a.status === 'late').length
    const absent = attendance.filter(a => a.status === 'absent').length
    res.json({
        user,
        summary: { total, present, late, absent },
        records: attendance
    })
})

// Finalize meeting attendance
router.post('/finalize/:meetingId', authenticate, isAdmin, async (req, res) => {
    try {
        const meetingId = Number(req.params.meetingId)
        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId }
        })
        if (!meeting) return res.status(404).json({ message: "Meeting not found" })

        const targetUsers = await prisma.user.findMany({
            where: {
                OR: [
                    { role: { equals: 'steward', mode: 'insensitive' } },
                    { role: { equals: 'pastor', mode: 'insensitive' } },
                    { role: { equals: 'leader', mode: 'insensitive' } }
                ]
            }
        });

        const existingAttendance = await prisma.attendance.findMany({
            where: { meetingId },
            select: { userId: true, status: true }
        });
        
        const markedUserIds = existingAttendance.map(a => a.userId);
        const unmarkedUsers = targetUsers.filter(user => !markedUserIds.includes(user.id));

        if (unmarkedUsers.length > 0) {
            const absentRecords = unmarkedUsers.map(user => ({
                userId: user.id,
                meetingId,
                status: 'absent',
                markedAt: new Date()
            }));

            await prisma.attendance.createMany({
                data: absentRecords
            });
        }

        await prisma.meeting.update({
            where: { id: meetingId },
            data: { status: 'Finalized' }
        });

        const finalPresent = existingAttendance.filter(a => a.status === 'present' || a.status === 'late').length;
        const finalLate = existingAttendance.filter(a => a.status === 'late').length;
        const finalAbsent = existingAttendance.filter(a => a.status === 'absent').length + unmarkedUsers.length;

        res.json({ 
            message: "Session finalized successfully",
            summary: {
                total: targetUsers.length,
                present: finalPresent,
                late: finalLate,
                absent: finalAbsent,
                performance: targetUsers.length > 0 ? Math.round((finalPresent / targetUsers.length) * 100) : 0
            }
        })
    } catch (error) {
        console.error('Finalize error:', error);
        res.status(500).json({ message: "Internal server error" });
    }
})

module.exports = router
