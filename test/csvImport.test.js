const { test } = require('node:test')
const assert = require('node:assert')
const { parseCsvUsers } = require('../utils/csvImport')

const CSV = [
  'fullName,email,phone,department,birthday,role',
  'Ada Obi,ada@example.com,08012345678,Security Dept.,25/12/1995,Leader',
  'Bola Ade,BOLA@Example.com,08012345679,Security Deptt,,Stward',
  'Chidi Oka,chidi@example.com,0801234567,Children Dept.,,',
  'Dara Eze,dara@example.com,08012345670,Team 1,,Admin',
  'Efe Sam,bad-email,08012345671,Protocol Dept.,,',
  'Funmi Ada,f@example.com,08012345672,Alpha Team,,',
  'Gift Ada,gift@example.com,08012345673,Protocol Dept.,,Bishop',
  'Ada Obi,ada@example.com,08012345674,Alpha Team,,',
].join('\n')

test('parseCsvUsers normalizes, corrects and reports per-row', () => {
  const { validRows, failures, corrections } = parseCsvUsers(CSV)

  assert.strictEqual(validRows.length, 4)
  assert.deepStrictEqual(validRows.map(r => [r.fullName, r.email, r.role, r.department, r.phone]), [
    ['Ada Obi', 'ada@example.com', 'leader', 'security dept.', '+2348012345678'],
    ['Bola Ade', 'bola@example.com', 'steward', 'security dept.', '+2348012345679'],
    ['Dara Eze', 'dara@example.com', 'admin', 'teamone', '+2348012345670'],
    ['Funmi Ada', 'f@example.com', 'steward', 'alpha team', '+2348012345672'],
  ])
  assert.ok(validRows[0].birthday instanceof Date)
  assert.strictEqual(validRows[1].birthday, null)

  assert.deepStrictEqual(
    failures.map(f => [f.row, f.field]),
    [
      [4, 'phone'],
      [6, 'email'],
      [8, 'role'],
      [9, 'email'],
    ],
  )
  const roleFailure = failures.find(f => f.row === 8)
  assert.match(roleFailure.message, /did you mean 'pastor'\?/)

  assert.deepStrictEqual(corrections, [
    { row: 3, field: 'role', from: 'Stward', to: 'steward' },
    { row: 3, field: 'department', from: 'Security Deptt', to: 'security dept.' },
    { row: 5, field: 'department', from: 'Team 1', to: 'teamone' },
  ])
})