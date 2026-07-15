const express = require('express')
const router = express.Router()
const { body } = require('express-validator')
const authenticate = require('../middleware/authenticate')
const isAdmin = require('../middleware/isAdmin')
const isAuthorized = require('../middleware/isAuthorized')
const { prisma } = require('../prisma')
const handleValidation = require('../middleware/validate')
const asyncHandler = require('../utils/asyncHandler')
const AppError = require('../utils/AppError')
const { success, created } = require('../utils/response')

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
router.post('/', authenticate, isAuthorized(['admin', 'pastor']), markAttendanceValidation, asyncHandler(async (req, res) => {
    const { userId, meetingId, status } = req.body
    const { role, department } = req.user
    
    const existingUser = await prisma.user.findUnique({ where: { id: Number(userId) } })
    if (!existingUser) throw new AppError('User not found', 404)
    
    const meeting = await prisma.meeting.findUnique({ where: { id: Number(meetingId) } })
    if (!meeting) throw new AppError("Meeting not found", 404)

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
    if (statusCode === 201) {
        return created(res, { attendance }, `Steward marked as ${finalStatus}`)
    }
    return success(res, { attendance }, `Steward marked as ${finalStatus}`)
}))

// Get attendance for a specific meeting
router.get('/meeting/:meetingId', authenticate, asyncHandler(async (req, res) => {
    const meetingId = Number(req.params.meetingId)
    const { role, department } = req.user

    const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId }
    })
    if (!meeting) throw new AppError("Meeting not found", 404)

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
    return success(res, {
        meeting,
        totalPresent: attendance.filter(a => a.status === 'present' || a.status === 'late').length,
        totalLate: attendance.filter(a => a.status === 'late').length,
        totalAbsent: attendance.filter(a => a.status === 'absent').length,
        totalExcused: attendance.filter(a => a.status === 'excused').length,
        attendance
    })
}))

// Get attendance of specific user 
router.get('/user/:userId', authenticate, asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId)
    const callerRole = req.user.role?.toLowerCase()
    const callerUserId = req.user.userId

    const isAdmin = callerRole === 'admin'
    const isOwnRecord = callerUserId === userId
    const isLeaderOrPastor = callerRole === 'leader' || callerRole === 'pastor'

    if (!isAdmin && !isOwnRecord && !isLeaderOrPastor) {
        throw new AppError("You can only view your own attendance records.", 403)
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
    if (!user) throw new AppError("User not found", 404)

    if (isLeaderOrPastor && !isOwnRecord && user.department !== req.user.department) {
        throw new AppError("You can only view attendance records for your own department.", 403)
    }

    const page = req.query.page ? Math.max(1, parseInt(req.query.page)) : null;
    const limit = page ? Math.min(100, Math.max(1, parseInt(req.query.limit) || 20)) : null;
    const skip = page ? (page - 1) * limit : undefined;
    const take = page ? limit : undefined;

    const where = { userId };

    const [attendance, total, stats] = await Promise.all([
        prisma.attendance.findMany({
            where,
            skip,
            take,
            include: { meeting: true },
            orderBy: { createdAt: 'desc' }
        }),
        page ? prisma.attendance.count({ where }) : Promise.resolve(0),
        prisma.attendance.groupBy({
            by: ['status'],
            where,
            _count: true,
        }),
    ]);

    const allTotal = stats.reduce((sum, s) => sum + s._count, 0);
    const present = stats.find(s => s.status === 'present' || s.status === 'late')?._count ?? 0;
    const late = stats.find(s => s.status === 'late')?._count ?? 0;
    const absent = stats.find(s => s.status === 'absent')?._count ?? 0;
    const excused = stats.find(s => s.status === 'excused')?._count ?? 0;

    return success(res, {
        user,
        summary: { total: allTotal, present, late, absent, excused },
        records: attendance,
        pagination: page ? { total: total ?? allTotal, page, limit, totalPages: Math.ceil((total ?? allTotal) / limit) } : null,
    })
}))

// Finalize meeting attendance
router.post('/finalize/:meetingId', authenticate, isAdmin, asyncHandler(async (req, res) => {
    const meetingId = Number(req.params.meetingId)
    const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId }
    })
    if (!meeting) throw new AppError("Meeting not found", 404)

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

    return success(res, {
        summary: {
            total: targetUsers.length,
            present: finalPresent,
            late: finalLate,
            absent: finalAbsent,
            excused: finalExcused,
            performance: targetUsers.length > 0 ? Math.round((finalPresent / targetUsers.length) * 100) : 0
        }
    }, "Session finalized successfully")
}))

// --- Excuse Request Routes ---

// Submit an excuse (Steward)
router.post('/excuse', authenticate, excuseValidation, asyncHandler(async (req, res) => {
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

    return created(res, { request }, 'Excuse request submitted successfully')
}))

// Get pending excuses (Admin/Pastor/Leader)
router.get('/excuse/pending', authenticate, isAuthorized(['admin', 'leader', 'pastor']), asyncHandler(async (req, res) => {
    const { role, department } = req.user
    
    let whereClause = { status: 'Pending' }
    
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
                select: { title: true, type: true, date: true }
            }
        }
    })
    return success(res, pending)
}))

// Resolve excuse request (Admin/Pastor/Leader)
router.patch('/excuse/:id', authenticate, isAuthorized(['admin', 'leader', 'pastor']), resolveExcuseValidation, asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const { status, adminComment } = req.body
    const { role, department } = req.user

    const excuseRequest = await prisma.excuseRequest.findUnique({
        where: { id },
        include: { steward: true }
    })

    if (!excuseRequest) {
        throw new AppError('Request not found', 404)
    }

    if (role?.toLowerCase() === 'leader' && excuseRequest.steward.department !== department) {
        throw new AppError('You can only resolve requests from your own department', 403)
    }

    const updatedRequest = await prisma.excuseRequest.update({
        where: { id },
        data: { status, adminComment }
    })

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

    return success(res, { request: updatedRequest }, `Excuse request ${status.toLowerCase()}`)
}))

// Get attendance history for the authenticated user (last 6 months)
const ATTENDANCE_HISTORY_MONTHS = 6

router.get('/my', authenticate, asyncHandler(async (req, res) => {
    const userId = req.user.userId
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - ATTENDANCE_HISTORY_MONTHS)

    const records = await prisma.attendance.findMany({
        where: {
            userId,
            markedAt: { gte: sixMonthsAgo }
        },
        include: {
            meeting: {
                select: { title: true, type: true, date: true, startTime: true, status: true }
            },
            excuseRequest: {
                select: { reason: true }
            }
        },
        orderBy: { markedAt: 'desc' }
    })

    return success(res, records)
}))

// Get excuse requests for the authenticated user
router.get('/excuse/my', authenticate, asyncHandler(async (req, res) => {
    const userId = req.user.userId

    const requests = await prisma.excuseRequest.findMany({
        where: { stewardId: userId },
        include: {
            meeting: {
                select: { title: true, type: true, date: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    })

    return success(res, requests)
}))

module.exports = router
