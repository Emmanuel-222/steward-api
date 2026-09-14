const { test } = require('node:test')
const assert = require('node:assert')
const { normalizeKey, normalizeRole, normalizeDepartment, normalizePhone } = require('../utils/normalize')

test('normalizeKey trims, lowercases, collapses whitespace', () => {
  assert.strictEqual(normalizeKey('  Security   DEPT. '), 'security dept.')
})

test('normalizeRole exact match is not corrected', () => {
  assert.deepStrictEqual(normalizeRole('Steward'), { value: 'steward', corrected: false, from: 'Steward', suggestion: null })
})

test('normalizeRole fixes misspelling', () => {
  const r = normalizeRole('Stward')
  assert.strictEqual(r.value, 'steward')
  assert.strictEqual(r.corrected, true)
})

test('normalizeRole alias administrator → admin', () => {
  const r = normalizeRole('Administrator')
  assert.strictEqual(r.value, 'admin')
  assert.strictEqual(r.corrected, true)
})

test('normalizeRole unknown returns suggestion', () => {
  const r = normalizeRole('bishop')
  assert.strictEqual(r.value, null)
  assert.strictEqual(r.suggestion, 'pastor')
})

test('normalizeDepartment exact match', () => {
  assert.strictEqual(normalizeDepartment('Security Dept.').value, 'security dept.')
})

test('normalizeDepartment fixes misspelling', () => {
  const r = normalizeDepartment('Security Deptt')
  assert.strictEqual(r.value, 'security dept.')
  assert.strictEqual(r.corrected, true)
})

test('normalizeDepartment alias team 1 → teamone', () => {
  assert.strictEqual(normalizeDepartment('Team 1').value, 'teamone')
})

test('normalizeDepartment abbreviation logistics → logistics and technical dept.', () => {
  assert.strictEqual(normalizeDepartment('Logistics').value, 'logistics and technical dept.')
})

test('normalizeDepartment unknown returns suggestion', () => {
  const r = normalizeDepartment('Zzz Dept')
  assert.strictEqual(r.value, null)
  assert.ok(r.suggestion)
})

test('normalizePhone accepts variants and normalizes to +234', () => {
  assert.strictEqual(normalizePhone('08012345678'), '+2348012345678')
  assert.strictEqual(normalizePhone('+234 801 234 5678'), '+2348012345678')
  assert.strictEqual(normalizePhone('2348012345678'), '+2348012345678')
  assert.strictEqual(normalizePhone('8012345678'), '+2348012345678')
})

test('normalizePhone rejects incomplete numbers', () => {
  assert.strictEqual(normalizePhone('0801234567'), null)
  assert.strictEqual(normalizePhone('abc'), null)
  assert.strictEqual(normalizePhone(''), null)
})