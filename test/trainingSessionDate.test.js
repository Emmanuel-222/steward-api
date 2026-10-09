const { test } = require('node:test')
const assert = require('node:assert')
const { sessionDate } = require('../utils/training')

test('sessionDate: week 1 is the start date', () => {
  assert.strictEqual(sessionDate('2026-01-04', 1).toISOString().slice(0, 10), '2026-01-04')
})

test('sessionDate: week 3 is start + 14 days', () => {
  assert.strictEqual(sessionDate('2026-01-04', 3).toISOString().slice(0, 10), '2026-01-18')
})

test('sessionDate: week 9 is start + 56 days', () => {
  assert.strictEqual(sessionDate('2026-01-04', 9).toISOString().slice(0, 10), '2026-03-01')
})
