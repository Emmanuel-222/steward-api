const express = require('express')
const router = express.Router()
const { body } = require('express-validator')
const authenticate = require('../middleware/authenticate')
const isAdmin = require('../middleware/isAdmin')
const isAuthorized = require('../middleware/isAuthorized')
const { prisma } = require('../prisma')
const handleValidation = require('../middleware/validate')

const markAttendanceValidation = [
    body('userId').isInt().withMessage('User ID must be a number'),
    body('meetingId').isInt().withMessage('Meeting ID must be a number'),
    handleValidation,
]

const excuseValidation = [
    body('meetingId').isInt().withMessage('Meeting ID must be a number'),
    body('reason').trim().notEmpty().withMessage('Reason is required'),
    handleValidation,
]

const resolveExcuseValidation = [
    body('status').isIn(['Approved', 'Rejected']).withMessage('Status must be Approved or Rejected'),
    handleValidation,
]

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
router.post('/', authenticate, isAuthorized(['admin', 'leader', 'pastor']), markAttendanceValidation, async (req, res) => {
    try {
        const { userId, meetingId, status } = req.body
        const { role, department } = req.user
        
        // check if user exist  
        const existingUser = await prisma.user.findUnique({ where: { id: Number(userId) } })
        if (!existingUser) return res.status(404).json({ message: 'User not found' })
        
        // If leader, ensure they are marking someone in their department
        if (role?.toLowerCase() === 'leader' && existingUser.department !== department) {
            return res.status(403).json({ message: 'You can only mark attendance for stewards in your department' })
        }
        
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
router.get('/meeting/:meetingId', authenticate, async (req, res) => {
    const meetingId = Number(req.params.meetingId)
    const { role, department } = req.user

    const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId }
    })
    if (!meeting) return res.status(404).json({ message: "Meeting not found" })

    let attendanceWhere = { meetingId }
    const lowerRole = role?.toLowerCase()
    
    if (lowerRole === 'leader') {
        attendanceWhere.user = {
            department: department
        }
    } else if (lowerRole === 'steward') {
        attendanceWhere.userId = req.user.userId
    }

    const attendance = await prisma.attendance.findMany({
        where: attendanceWhere,
        include: {
            user: {
                select: {
                    id: true,
                    fullName: true,
                    department: true,
                    role: true
                }
            },
            excuseRequest: {
                select: {
                    reason: true
                }
            }
        }
    })
    res.json({
        meeting,
        totalPresent: attendance.filter(a => a.status === 'present' || a.status === 'late').length,
        totalLate: attendance.filter(a => a.status === 'late').length,
        totalAbsent: attendance.filter(a => a.status === 'absent').length,
        totalExcused: attendance.filter(a => a.status === 'excused').length,
        attendance
    })
})

// Get attendance of specific user 
router.get('/user/:userId', authenticate, async (req, res) => {
    const userId = Number(req.params.userId)
    
    // Allow admins to see anyone, but regular users can only see themselves
    if (req.user.role?.toLowerCase() !== 'admin' && req.user.userId !== userId) {
        return res.status(403).json({ message: "You can only view your own attendance records." })
    }
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
    const excused = attendance.filter(a => a.status === 'excused').length
    res.json({
        user,
        summary: { total, present, late, absent, excused },
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
        const finalExcused = existingAttendance.filter(a => a.status === 'excused').length;
        const finalAbsent = existingAttendance.filter(a => a.status === 'absent').length + unmarkedUsers.length;

        res.json({ 
            message: "Session finalized successfully",
            summary: {
                total: targetUsers.length,
                present: finalPresent,
                late: finalLate,
                absent: finalAbsent,
                excused: finalExcused,
                performance: targetUsers.length > 0 ? Math.round((finalPresent / targetUsers.length) * 100) : 0
            }
        })
    } catch (error) {
        console.error('Finalize error:', error);
        res.status(500).json({ message: "Internal server error" });
    }
})

// --- Excuse Request Routes ---

// Submit an excuse (Steward)
router.post('/excuse', authenticate, excuseValidation, async (req, res) => {
    try {
        const { meetingId, reason } = req.body
        const stewardId = req.user.userId

        const request = await prisma.excuseRequest.create({
            data: {
                stewardId,
                meetingId: Number(meetingId),
                reason,
                status: 'Pending'
            }
        })

        res.status(201).json({ message: 'Excuse request submitted successfully', request })
    } catch (error) {
        console.error('Submit excuse error:', error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// Get pending excuses (Admin/Pastor/Leader)
router.get('/excuse/pending', authenticate, isAuthorized(['admin', 'leader', 'pastor']), async (req, res) => {
    try {
        const { role, department } = req.user
        
        let whereClause = { status: 'Pending' }
        
        // If leader, only show requests from their department
        if (role?.toLowerCase() === 'leader') {
            whereClause.steward = {
                department: department
            }
        }

        const pending = await prisma.excuseRequest.findMany({
            where: whereClause,
            include: {
                steward: {
                    select: { fullName: true, department: true }
                },
                meeting: {
                    select: { type: true, date: true }
                }
            }
        })
        res.json(pending)
    } catch (error) {
        console.error('Get pending excuses error:', error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// Resolve excuse request (Admin/Pastor/Leader)
router.patch('/excuse/:id', authenticate, isAuthorized(['admin', 'leader', 'pastor']), resolveExcuseValidation, async (req, res) => {
    try {
        const id = Number(req.params.id)
        const { status, adminComment } = req.body
        const { role, department } = req.user

        const excuseRequest = await prisma.excuseRequest.findUnique({
            where: { id },
            include: { steward: true }
        })

        if (!excuseRequest) {
            return res.status(404).json({ message: 'Request not found' })
        }

        // If leader, ensure they are resolving a request from their own department
        if (role?.toLowerCase() === 'leader' && excuseRequest.steward.department !== department) {
            return res.status(403).json({ message: 'You can only resolve requests from your own department' })
        }

        const updatedRequest = await prisma.excuseRequest.update({
            where: { id },
            data: { status, adminComment }
        })

        // If approved, update attendance table
        if (status === 'Approved') {
            await prisma.attendance.upsert({
                where: {
                    userId_meetingId: {
                        userId: excuseRequest.stewardId,
                        meetingId: excuseRequest.meetingId
                    }
                },
                update: { 
                    status: 'excused', 
                    markedAt: new Date(),
                    excuseRequestId: excuseRequest.id
                },
                create: {
                    userId: excuseRequest.stewardId,
                    meetingId: excuseRequest.meetingId,
                    status: 'excused',
                    markedAt: new Date(),
                    excuseRequestId: excuseRequest.id
                }
            })
        }

        res.json({ message: `Excuse request ${status.toLowerCase()}`, request: updatedRequest })
    } catch (error) {
        console.error('Resolve excuse error:', error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

module.exports = router
