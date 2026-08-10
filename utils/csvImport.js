const { parse } = require('csv-parse/sync')
const { parseBirthday } = require('./birthday')

const REQUIRED_COLUMNS = ['fullname', 'email', 'phone', 'department']
const ROLE_ALIASES = { steward: 'Steward', leader: 'Leader', pastor: 'Pastor' }
const MAX_ROWS = 1000

function parseCsvUsers(csvText) {
    const failures = []
    let records
    try {
        records = parse(csvText, { skip_empty_lines: true, trim: true, bom: true })
    } catch (err) {
        return { validRows: [], failures: [{ row: 0, field: 'file', message: `Could not parse CSV: ${err.message}` }] }
    }
    if (records.length === 0) {
        return { validRows: [], failures: [{ row: 0, field: 'file', message: 'The CSV file is empty' }] }
    }
    const header = records[0].map(h => String(h).trim().toLowerCase())
    const missing = REQUIRED_COLUMNS.filter(c => !header.includes(c))
    if (missing.length > 0) {
        return { validRows: [], failures: [{ row: 1, field: 'file', message: `Missing required column(s): ${missing.join(', ')}` }] }
    }
    const dataRows = records.slice(1)
    if (dataRows.length > MAX_ROWS) {
        return { validRows: [], failures: [{ row: 1, field: 'file', message: `Too many rows: ${dataRows.length} (max ${MAX_ROWS})` }] }
    }
    const col = name => header.indexOf(name)
    const get = (cells, name) => (col(name) >= 0 ? String(cells[col(name)] ?? '').trim() : '')

    const seenEmails = new Set()
    const validRows = []
    dataRows.forEach((cells, index) => {
        const line = index + 2
        const fullName = get(cells, 'fullname')
        const email = get(cells, 'email').toLowerCase()
        const phone = get(cells, 'phone')
        const department = get(cells, 'department')
        const birthdayRaw = get(cells, 'birthday')
        const roleRaw = get(cells, 'role')
        let role = 'Steward'
        if (roleRaw) {
            const normalized = ROLE_ALIASES[roleRaw.toLowerCase()]
            if (!normalized) {
                failures.push({ row: line, field: 'role', message: 'Role must be steward, leader or pastor' })
            } else {
                role = normalized
            }
        }

        if (!fullName) failures.push({ row: line, field: 'fullName', message: 'Full name is required' })
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) failures.push({ row: line, field: 'email', message: 'Invalid email address' })
        if (!phone) failures.push({ row: line, field: 'phone', message: 'Phone number is required' })
        if (!department) failures.push({ row: line, field: 'department', message: 'Department is required' })
        if (seenEmails.has(email)) failures.push({ row: line, field: 'email', message: 'Duplicate email within file' })
        if (birthdayRaw) {
            try { parseBirthday(birthdayRaw) }
            catch { failures.push({ row: line, field: 'birthday', message: 'Invalid birthday — use DD/MM/YYYY' }) }
        }

        const rowHasErrors = failures.some(f => f.row === line)
        if (!rowHasErrors) {
            seenEmails.add(email)
            validRows.push({ line, fullName, email, phone, department, role, birthday: birthdayRaw ? parseBirthday(birthdayRaw) : null })
        }
    })
    return { validRows, failures }
}

module.exports = { parseCsvUsers }
