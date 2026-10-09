const express = require('express')
const router = express.Router()
const { prisma } = require('../prisma')
const authenticate = require('../middleware/authenticate')
const isAdmin = require('../middleware/isAdmin')
const asyncHandler = require('../utils/asyncHandler')
const AppError = require('../utils/AppError')
const { success } = require('../utils/response')
const { computeGraduationStatus, sessionDate } = require('../utils/training')
const { WIT_CURRICULUM } = require('../utils/witCurriculum')

async function missedForCohort(cohortId, userId, track = 'new') {
  const topicFilter = track === 'refresher'
    ? { requiredForRefresher: true }
    : { requiredForNew: true }
  const classes = await prisma.trainingClass.findMany({
    where: { cohortId, topic: topicFilter },
    select: { meetingId: true },
  })
  const meetingIds = classes.map((c) => c.meetingId)
  if (meetingIds.length === 0) return 0

  const absents = await prisma.attendance.findMany({
    where: { userId, meetingId: { in: meetingIds }, status: 'absent' },
    select: { meetingId: true },
  })
  const excused = await prisma.excuseRequest.findMany({
    where: { stewardId: userId, meetingId: { in: meetingIds }, status: 'Approved' },
    select: { meetingId: true },
  })
  const excusedSet = new Set(excused.map((e) => e.meetingId))
  return absents.filter((a) => !excusedSet.has(a.meetingId)).length
}

async function activeEnrollment(userId) {
  return prisma.trainingEnrollment.findFirst({
    where: { userId, status: 'enrolled' },
    include: {
      cohort: {
        include: {
          topics: { orderBy: [{ weekNumber: 'asc' }, { startTime: 'asc' }] },
        },
      },
    },
  })
}

// --- cohorts ---
router.get('/cohorts', authenticate, isAdmin, asyncHandler(async (_req, res) => {
  const cohorts = await prisma.trainingCohort.findMany({
    orderBy: { startDate: 'desc' },
    include: {
      _count: { select: { enrollments: true, topics: true } },
      topics: { select: { teacherId: true, teacher: { select: { id: true, fullName: true } } } },
    },
  })
  return success(res, cohorts)
}))

router.post('/cohorts', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const { name, startDate, weekCount, maxMissedClasses = 3 } = req.body
  if (!name || !startDate || !weekCount) {
    throw new AppError('name, startDate and weekCount are required', 400)
  }
  const cohort = await prisma.trainingCohort.create({
    data: {
      name,
      startDate: new Date(startDate),
      weekCount: Number(weekCount),
      maxMissedClasses: Number(maxMissedClasses),
    },
  })
  return success(res, cohort, 'Cohort created')
}))

router.get('/cohorts/:id', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const cohort = await prisma.trainingCohort.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      topics: { orderBy: { weekNumber: 'asc' }, include: { teacher: { select: { id: true, fullName: true } } } },
      _count: { select: { enrollments: true, classes: true } },
    },
  })
  if (!cohort) throw new AppError('Cohort not found', 404)
  return success(res, cohort)
}))

router.patch('/cohorts/:id', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const { name, startDate, weekCount, maxMissedClasses, status } = req.body
  const data = {}
  if (name !== undefined) data.name = name
  if (startDate !== undefined) data.startDate = new Date(startDate)
  if (weekCount !== undefined) data.weekCount = Number(weekCount)
  if (maxMissedClasses !== undefined) data.maxMissedClasses = Number(maxMissedClasses)
  if (status !== undefined) data.status = status
  const cohort = await prisma.trainingCohort.update({
    where: { id: Number(req.params.id) },
    data,
  })
  return success(res, cohort, 'Cohort updated')
}))

// --- topics ---
router.post('/cohorts/:id/topics', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const cohortId = Number(req.params.id)
  const {
    weekNumber, title, description, notes, teacherId,
    day, startTime, endTime, requiredForNew, requiredForRefresher,
  } = req.body
  if (!weekNumber || !title) throw new AppError('weekNumber and title are required', 400)
  if (!startTime) throw new AppError('startTime is required for a session', 400)
  const data = {
    title,
    description,
    notes,
    teacherId: teacherId ? Number(teacherId) : null,
    day: day || 'Sunday',
    startTime,
    endTime: endTime || null,
    requiredForNew: requiredForNew === undefined ? true : Boolean(requiredForNew),
    requiredForRefresher: requiredForRefresher === undefined ? false : Boolean(requiredForRefresher),
  }
  const topic = await prisma.trainingTopic.upsert({
    where: { cohortId_weekNumber_startTime: { cohortId, weekNumber: Number(weekNumber), startTime } },
    update: data,
    create: { cohortId, weekNumber: Number(weekNumber), ...data },
  })
  return success(res, topic, 'Session saved')
}))

router.post('/cohorts/:id/generate', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const cohortId = Number(req.params.id)
  const cohort = await prisma.trainingCohort.findUnique({ where: { id: cohortId } })
  if (!cohort) throw new AppError('Cohort not found', 404)
  const topics = await prisma.trainingTopic.findMany({ where: { cohortId } })
  let created = 0
  for (const topic of topics) {
    const existing = await prisma.trainingClass.findFirst({ where: { topicId: topic.id } })
    if (existing) continue
    const meeting = await prisma.meeting.create({
      data: {
        title: topic.title,
        type: 'Training',
        date: sessionDate(cohort.startDate, topic.weekNumber),
        startTime: topic.startTime || '7:10 AM',
        endTime: topic.endTime || '8:10 AM',
        cutoffTime: topic.endTime || '8:10 AM',
        location: cohort.name,
        status: 'Ongoing',
      },
    })
    await prisma.trainingClass.create({ data: { cohortId, topicId: topic.id, meetingId: meeting.id } })
    created += 1
  }
  return success(res, { created }, `Generated ${created} session(s)`)
}))

router.post('/cohorts/:id/seed-curriculum', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const cohortId = Number(req.params.id)
  const cohort = await prisma.trainingCohort.findUnique({ where: { id: cohortId } })
  if (!cohort) throw new AppError('Cohort not found', 404)
  let created = 0
  for (const s of WIT_CURRICULUM) {
    const exists = await prisma.trainingTopic.findFirst({
      where: { cohortId, weekNumber: s.weekNumber, startTime: s.startTime },
    })
    if (exists) continue
    await prisma.trainingTopic.create({
      data: {
        cohortId,
        weekNumber: s.weekNumber,
        day: 'Sunday',
        startTime: s.startTime,
        endTime: s.endTime,
        title: s.title,
        notes: s.teacher ? `Teacher: ${s.teacher}` : null,
        requiredForNew: true,
        requiredForRefresher: Boolean(s.requiredForRefresher),
      },
    })
    created += 1
  }
  return success(res, { created }, `Loaded ${created} standard session(s)`)
}))

router.delete('/topics/:topicId', authenticate, isAdmin, asyncHandler(async (req, res) => {
  await prisma.trainingTopic.delete({ where: { id: Number(req.params.topicId) } })
  return success(res, null, 'Topic deleted')
}))

// --- classes ---
router.post('/cohorts/:id/classes', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const cohortId = Number(req.params.id)
  const { topicId, title, date, startTime, cutoffTime, endTime, location } = req.body
  if (!date || !startTime || !endTime || !location) {
    throw new AppError('date, startTime, endTime and location are required', 400)
  }
  const result = await prisma.$transaction(async (tx) => {
    const meeting = await tx.meeting.create({
      data: {
        title: title || 'Training Class',
        type: 'Training',
        date: new Date(date),
        startTime,
        cutoffTime: cutoffTime || endTime,
        endTime,
        location,
        status: 'Ongoing',
      },
    })
    const trainingClass = await tx.trainingClass.create({
      data: { cohortId, topicId: topicId ? Number(topicId) : null, meetingId: meeting.id },
    })
    return { meeting, trainingClass }
  })
  return success(res, result, 'Class scheduled')
}))

router.get('/cohorts/:id/classes', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const classes = await prisma.trainingClass.findMany({
    where: { cohortId: Number(req.params.id) },
    include: { meeting: true, topic: true },
    orderBy: { meeting: { date: 'desc' } },
  })
  return success(res, classes)
}))

// --- roster + graduate ---
router.get('/cohorts/:id/trainees', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const cohortId = Number(req.params.id)
  const cohort = await prisma.trainingCohort.findUnique({ where: { id: cohortId } })
  if (!cohort) throw new AppError('Cohort not found', 404)
  const enrollments = await prisma.trainingEnrollment.findMany({
    where: { cohortId },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  })
  const trainees = []
  for (const e of enrollments) {
    const missed = await missedForCohort(cohortId, e.userId, e.track)
    trainees.push({
      userId: e.userId,
      name: e.user.fullName,
      email: e.user.email,
      track: e.track,
      enrollmentStatus: e.status,
      missed,
      maxMissedClasses: cohort.maxMissedClasses,
      graduation: computeGraduationStatus(missed, cohort.maxMissedClasses),
    })
  }
  return success(res, trainees)
}))

router.post('/cohorts/:id/trainees/:userId/graduate', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const cohortId = Number(req.params.id)
  const userId = Number(req.params.userId)
  await prisma.$transaction([
    prisma.trainingEnrollment.update({
      where: { userId_cohortId: { userId, cohortId } },
      data: { status: 'graduated', graduatedAt: new Date() },
    }),
    prisma.user.update({ where: { id: userId }, data: { role: 'steward' } }),
  ])
  return success(res, null, 'Trainee graduated and moved to worker')
}))

// --- self (trainee) ---
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.userId
  const enrollment = await activeEnrollment(userId)
  if (!enrollment) throw new AppError('No active training enrollment', 404)

  const cohort = enrollment.cohort
  const track = enrollment.track || 'new'
  const isRequired = (t) => (track === 'refresher' ? t.requiredForRefresher : t.requiredForNew)
  const missed = await missedForCohort(cohort.id, userId, track)

  const classes = await prisma.trainingClass.findMany({
    where: { cohortId: cohort.id },
    include: { meeting: true, topic: true },
    orderBy: { meeting: { date: 'asc' } },
  })
  const now = new Date()
  const nextRequired = classes.find(
    (c) => c.topic && isRequired(c.topic) && new Date(c.meeting.date) >= now,
  ) || null
  const elapsedWeeks = Math.max(
    1,
    Math.min(
      cohort.weekCount,
      Math.floor((now - new Date(cohort.startDate)) / (7 * 24 * 60 * 60 * 1000)) + 1,
    ),
  )
  const currentTopic = cohort.topics.find((t) => t.weekNumber === elapsedWeeks && isRequired(t)) || null

  return success(res, {
    cohort: {
      id: cohort.id,
      name: cohort.name,
      weekCount: cohort.weekCount,
      maxMissedClasses: cohort.maxMissedClasses,
      track,
    },
    currentTopic: currentTopic
      ? { weekNumber: currentTopic.weekNumber, title: currentTopic.title, description: currentTopic.description }
      : null,
    nextClass: nextRequired
      ? {
          date: nextRequired.meeting.date,
          startTime: nextRequired.meeting.startTime,
          endTime: nextRequired.meeting.endTime,
          location: nextRequired.meeting.location,
          topic: nextRequired.topic.title,
          teacher: nextRequired.topic.teacher ? nextRequired.topic.teacher.fullName : null,
        }
      : null,
    missed,
    graduation: computeGraduationStatus(missed, cohort.maxMissedClasses),
  })
}))

router.get('/me/classes', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.userId
  const enrollment = await activeEnrollment(userId)
  if (!enrollment) throw new AppError('No active training enrollment', 404)
  const track = enrollment.track || 'new'
  const isRequired = (t) => (track === 'refresher' ? t.requiredForRefresher : t.requiredForNew)

  const topics = await prisma.trainingTopic.findMany({
    where: { cohortId: enrollment.cohortId },
    orderBy: [{ weekNumber: 'asc' }, { startTime: 'asc' }],
    include: { teacher: { select: { fullName: true } }, classes: { include: { meeting: true } } },
  })
  const meetingIds = topics.flatMap((t) => t.classes.map((c) => c.meetingId))
  const records = meetingIds.length
    ? await prisma.attendance.findMany({ where: { userId, meetingId: { in: meetingIds } } })
    : []
  const byMeeting = new Map(records.map((r) => [r.meetingId, r.status]))
  const excused = meetingIds.length
    ? await prisma.excuseRequest.findMany({
        where: { stewardId: userId, meetingId: { in: meetingIds }, status: 'Approved' },
      })
    : []
  const excusedSet = new Set(excused.map((e) => e.meetingId))

  return success(res, topics.map((t) => {
    const cls = t.classes[0]
    const meeting = cls ? cls.meeting : null
    let status = 'Upcoming'
    if (meeting && excusedSet.has(meeting.id)) {
      status = 'Excused'
    } else if (meeting && byMeeting.has(meeting.id)) {
      const s = String(byMeeting.get(meeting.id)).toLowerCase()
      status = s === 'present' || s === 'late' ? 'Present' : s === 'excused' ? 'Excused' : 'Absent'
    } else if (meeting) {
      status = 'Unmarked'
    }
    return {
      id: t.id,
      meetingId: meeting ? meeting.id : null,
      week: t.weekNumber,
      day: t.day,
      topic: t.title,
      teacher: t.teacher ? t.teacher.fullName : null,
      date: meeting ? meeting.date : null,
      startTime: meeting ? meeting.startTime : t.startTime,
      endTime: meeting ? meeting.endTime : t.endTime,
      location: meeting ? meeting.location : null,
      required: isRequired(t),
      status,
    }
  }))
}))

// --- teacher view ---
router.get('/teaching', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.userId
  const classes = await prisma.trainingClass.findMany({
    where: { topic: { teacherId: userId } },
    include: { meeting: true, topic: true, cohort: { select: { id: true, name: true } } },
    orderBy: { meeting: { date: 'desc' } },
  })
  const reshaped = classes.map((c) => ({
    classId: c.id,
    meetingId: c.meetingId,
    cohortId: c.cohortId,
    cohortName: c.cohort.name,
    topic: c.topic ? c.topic.title : null,
    week: c.topic ? c.topic.weekNumber : null,
    date: c.meeting.date,
    startTime: c.meeting.startTime,
    endTime: c.meeting.endTime,
    location: c.meeting.location,
  }))
  return success(res, { isTeacher: reshaped.length > 0, classes: reshaped })
}))

router.get('/classes/:classId/roster', authenticate, asyncHandler(async (req, res) => {
  const classId = Number(req.params.classId)
  const cls = await prisma.trainingClass.findUnique({
    where: { id: classId },
    include: { topic: true, cohort: true },
  })
  if (!cls) throw new AppError('Class not found', 404)

  const callerId = req.user.userId
  const callerRole = String(req.user.role || '').toLowerCase()
  const isTeacher = cls.topic && cls.topic.teacherId === callerId
  if (callerRole !== 'admin' && !isTeacher) {
    throw new AppError('Not authorized to view this class roster', 403)
  }

  const enrollments = await prisma.trainingEnrollment.findMany({
    where: { cohortId: cls.cohortId, status: { in: ['enrolled', 'graduated'] } },
    include: { user: { select: { id: true, fullName: true } } },
  })
  const records = await prisma.attendance.findMany({ where: { meetingId: cls.meetingId } })
  const byUser = new Map(records.map((r) => [r.userId, r.status]))

  return success(res, {
    classId: cls.id,
    meetingId: cls.meetingId,
    cohortName: cls.cohort.name,
    topic: cls.topic ? cls.topic.title : null,
    week: cls.topic ? cls.topic.weekNumber : null,
    roster: enrollments.map((e) => ({
      userId: e.userId,
      name: e.user.fullName,
      status: byUser.get(e.userId) || 'Unmarked',
    })),
  })
}))

module.exports = router
