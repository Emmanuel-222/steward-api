function computeGraduationStatus(missed, maxMissed) {
  const m = Number(missed) || 0
  const max = Number(maxMissed)
  if (m > max) return 'will_not_graduate'
  if (m === max) return 'at_risk'
  return 'on_track'
}

function sessionDate(startDate, weekNumber) {
  const base = new Date(startDate)
  const y = base.getUTCFullYear()
  const m = base.getUTCMonth()
  const d = base.getUTCDate()
  return new Date(Date.UTC(y, m, d + (Number(weekNumber) - 1) * 7))
}

module.exports = { computeGraduationStatus, sessionDate }
