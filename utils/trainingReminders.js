const DAY_MS = 24 * 60 * 60 * 1000

// Days before the class on which a teacher is reminded.
const REMINDER_OFFSETS = [7, 3, 1]

// The [start, end) UTC window for sessions that are exactly `offset` days from `todayUtc`.
function targetDayRange(todayUtc, offset) {
  return {
    start: new Date(todayUtc + offset * DAY_MS),
    end: new Date(todayUtc + (offset + 1) * DAY_MS),
  }
}

module.exports = { DAY_MS, REMINDER_OFFSETS, targetDayRange }
