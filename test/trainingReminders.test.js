const { test } = require('node:test')
const assert = require('node:assert')
const { REMINDER_OFFSETS, targetDayRange } = require('../utils/trainingReminders')
const { buildReminderEmail, buildAssignmentEmail } = require('../utils/emailTemplates')

test('reminder offsets are 7, 3 and 1 days before the class', () => {
  assert.deepEqual(REMINDER_OFFSETS, [7, 3, 1])
})

test('targetDayRange returns the one-day window offset days out', () => {
  const today = Date.UTC(2026, 0, 1)
  const { start, end } = targetDayRange(today, 7)
  assert.equal(start.toISOString(), new Date(Date.UTC(2026, 0, 8)).toISOString())
  assert.equal(end.toISOString(), new Date(Date.UTC(2026, 0, 9)).toISOString())
})

test('buildReminderEmail names the offset for a 1-day reminder', () => {
  const email = buildReminderEmail(
    {
      teacherName: 'Ada Obi',
      cohortName: '2026',
      week: 3,
      topic: 'Prayer',
      date: '2026-01-12T00:00:00.000Z',
      startTime: '7:10 AM',
      endTime: '8:10 AM',
      location: 'Hall A',
    },
    1,
  )
  assert.match(email.subject, /tomorrow/)
  assert.match(email.subject, /Week 3/)
  assert.match(email.html, /Prayer/)
})

test('buildAssignmentEmail falls back to "To be confirmed" when there is no date', () => {
  const email = buildAssignmentEmail({
    teacherName: 'Ada Obi',
    cohortName: '2026',
    week: 9,
    topic: 'Missions',
    date: null,
    startTime: '11:30 AM',
    endTime: '12:45 PM',
    location: 'Hall B',
  })
  assert.match(email.subject, /Week 9/)
  assert.match(email.html, /To be confirmed/)
})
