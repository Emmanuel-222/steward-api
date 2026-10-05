function computeGraduationStatus(missed, maxMissed) {
  const m = Number(missed) || 0
  const max = Number(maxMissed)
  if (m > max) return 'will_not_graduate'
  if (m === max) return 'at_risk'
  return 'on_track'
}

module.exports = { computeGraduationStatus }
