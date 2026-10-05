const { test } = require('node:test')
const assert = require('node:assert')
const { computeGraduationStatus } = require('../utils/training')

test('computeGraduationStatus: below threshold is on_track', () => {
  assert.strictEqual(computeGraduationStatus(1, 3), 'on_track')
})

test('computeGraduationStatus: zero misses is on_track', () => {
  assert.strictEqual(computeGraduationStatus(0, 3), 'on_track')
})

test('computeGraduationStatus: exactly at threshold is at_risk', () => {
  assert.strictEqual(computeGraduationStatus(3, 3), 'at_risk')
})

test('computeGraduationStatus: above threshold will_not_graduate', () => {
  assert.strictEqual(computeGraduationStatus(4, 3), 'will_not_graduate')
})
