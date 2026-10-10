const cron = require('node-cron')
const { prisma } = require('../prisma')
const { sendEmail } = require('../utils/email')
const { buildReminderEmail } = require('../utils/emailTemplates')
const { REMINDER_OFFSETS, targetDayRange } = require('../utils/trainingReminders')

async function sendRemindersForOffset(offset, todayUtc) {
  const { start, end } = targetDayRange(todayUtc, offset)

  const classes = await prisma.trainingClass.findMany({
    where: {
      topic: { teacherId: { not: null } },
      meeting: { date: { gte: start, lt: end } },
      reminders: { none: { offset } },
    },
    include: {
      meeting: true,
      topic: { include: { teacher: { select: { fullName: true, email: true } } } },
      cohort: { select: { name: true } },
    },
  })

  for (const cls of classes) {
    const teacher = cls.topic?.teacher
    if (!cls.topic || !teacher?.email) continue

    const session = {
      teacherName: teacher.fullName,
      cohortName: cls.cohort.name,
      week: cls.topic.weekNumber,
      topic: cls.topic.title,
      date: String(cls.meeting.date),
      startTime: cls.meeting.startTime,
      endTime: cls.meeting.endTime,
      location: cls.meeting.location,
    }

    try {
      await sendEmail({ to: teacher.email, ...buildReminderEmail(session, offset) })
      await prisma.trainingReminderSent.create({ data: { classId: cls.id, offset } })
      console.log(`[trainingReminders] sent ${offset}-day reminder for class ${cls.id}`)
    } catch (error) {
      console.error(`[trainingReminders] failed ${offset}-day reminder for class ${cls.id}: ${error.message ?? error}`)
    }
  }
}

const startTrainingReminders = () => {
  // Daily at 07:00 Africa/Lagos
  cron.schedule(
    '0 7 * * *',
    async () => {
      const now = new Date()
      const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      try {
        for (const offset of REMINDER_OFFSETS) {
          await sendRemindersForOffset(offset, todayUtc)
        }
      } catch (error) {
        console.error('[trainingReminders] run failed:', error)
      }
    },
    { timezone: 'Africa/Lagos' },
  )
}

module.exports = startTrainingReminders
