const ROLES = ['steward', 'leader', 'pastor', 'admin']

const DEPARTMENTS = [
  'children dept.',
  'teens dept.',
  'teamone',
  'light team',
  'sanitation dept.',
  'edification team',
  'protocol dept.',
  'welfare dept.',
  'security dept.',
  'programs dept.',
  'alpha team',
  'logistics and technical dept.',
]

const ROLE_ALIASES = {
  administrator: 'admin',
  lead: 'leader',
  head: 'leader',
  stewardess: 'steward',
}

const DEPARTMENT_ALIASES = {
  children: 'children dept.',
  teens: 'teens dept.',
  teen: 'teens dept.',
  'team 1': 'teamone',
  'team one': 'teamone',
  team1: 'teamone',
  light: 'light team',
  sanitation: 'sanitation dept.',
  edification: 'edification team',
  protocol: 'protocol dept.',
  welfare: 'welfare dept.',
  security: 'security dept.',
  programs: 'programs dept.',
  programme: 'programs dept.',
  programmes: 'programs dept.',
  alpha: 'alpha team',
  logistics: 'logistics and technical dept.',
  technical: 'logistics and technical dept.',
  tech: 'logistics and technical dept.',
  'logistics and technical': 'logistics and technical dept.',
  'logistics and technical dept': 'logistics and technical dept.',
}

const FUZZY_THRESHOLD = 0.6
const FUZZY_GAP = 0.15

function normalizeKey(raw) {
  return String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j += 1) dp[0][j] = j
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[m][n]
}

function matchCanonical(raw, canonicalList, aliases = {}) {
  const key = normalizeKey(raw)
  if (!key) return { value: null, corrected: false, from: raw, suggestion: null }
  if (canonicalList.includes(key)) return { value: key, corrected: false, from: raw, suggestion: null }
  const alias = aliases[key]
  if (alias) return { value: alias, corrected: true, from: raw, suggestion: null }
  const scored = canonicalList
    .map((candidate) => ({
      candidate,
      similarity: 1 - levenshtein(key, candidate) / Math.max(key.length, candidate.length),
    }))
    .sort((a, b) => b.similarity - a.similarity)
  const best = scored[0]
  const second = scored[1]
  if (best && best.similarity >= FUZZY_THRESHOLD && (!second || best.similarity - second.similarity >= FUZZY_GAP)) {
    return { value: best.candidate, corrected: true, from: raw, suggestion: null }
  }
  return { value: null, corrected: false, from: raw, suggestion: best ? best.candidate : null }
}

function normalizeRole(raw) {
  return matchCanonical(raw, ROLES, ROLE_ALIASES)
}

function normalizeDepartment(raw) {
  return matchCanonical(raw, DEPARTMENTS, DEPARTMENT_ALIASES)
}

function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  let national = digits
  if (national.startsWith('234') && national.length >= 12) national = national.slice(3)
  else if (national.startsWith('0')) national = national.replace(/^0+/, '')
  if (!/^\d{10}$/.test(national)) return null
  return `+234${national}`
}

module.exports = { ROLES, DEPARTMENTS, normalizeKey, matchCanonical, normalizeRole, normalizeDepartment, normalizePhone }