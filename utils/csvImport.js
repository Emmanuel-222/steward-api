const { parse } = require('csv-parse/sync')
const { parseBirthday } = require('./birthday')
const { normalizeRole, normalizeDepartment, normalizePhone } = require('./normalize')
const validator = require('validator')

const REQUIRED_COLUMNS = ['fullname', 'email', 'phone', 'department']
const MAX_ROWS = 1000

function parseCsvUsers(csvText) {
    const failures = []
    const corrections = []
    let records
    try {
        records = parse(csvText, { skip_empty_lines: true, trim: true, bom: true })
    } catch (err) {
        return { validRows: [], failures: [{ row: 0, field: 'file', message: `Could not parse CSV: ${err.message}` }], corrections: [] }
    }
    if (records.length === 0) {
        return { validRows: [], failures: [{ row: 0, field: 'file', message: 'The CSV file is empty' }], corrections: [] }
    }
    const header = records[0].map(h => String(h).trim().toLowerCase())
    const missing = REQUIRED_COLUMNS.filter(c => !header.includes(c))
    if (missing.length > 0) {
        return { validRows: [], failures: [{ row: 1, field: 'file', message: `Missing required column(s): ${missing.join(', ')}` }], corrections: [] }
    }
    const dataRows = records.slice(1)
    if (dataRows.length > MAX_ROWS) {
        return { validRows: [], failures: [{ row: 1, field: 'file', message: `Too many rows: ${dataRows.length} (max ${MAX_ROWS})` }], corrections: [] }
    }
    const col = name => header.indexOf(name)
    const get = (cells, name) => (col(name) >= 0 ? String(cells[col(name)] ?? '').trim() : '')

    const seenEmails = new Set()
    const validRows = []
    dataRows.forEach((cells, index) => {
        const line = index + 2
        const fullName = get(cells, 'fullname')
        const email = get(cells, 'email').toLowerCase()
        const phoneRaw = get(cells, 'phone')
        const departmentRaw = get(cells, 'department')
        const birthdayRaw = get(cells, 'birthday')
        const roleRaw = get(cells, 'role')

        let role = 'steward'
        if (roleRaw) {
            const matched = normalizeRole(roleRaw)
            if (!matched.value) {
                failures.push({
                    row: line, field: 'role',
                    message: matched.suggestion
                        ? `Unknown role — did you mean '${matched.suggestion}'?`
                        : 'Role must be steward, leader, pastor or admin',
                })
            } else {
                role = matched.value
                if (matched.corrected) corrections.push({ row: line, field: 'role', from: roleRaw, to: matched.value })
            }
        }

        const department = normalizeDepartment(departmentRaw)
        if (!departmentRaw) {
            failures.push({ row: line, field: 'department', message: 'Department is required' })
        } else if (!department.value) {
            failures.push({
                row: line, field: 'department',
                message: department.suggestion
                    ? `Unknown department — did you mean '${department.suggestion}'?`
                    : 'Unknown department',
            })
        } else if (department.corrected) {
            corrections.push({ row: line, field: 'department', from: departmentRaw, to: department.value })
        }

        const phone = normalizePhone(phoneRaw)
        if (!phoneRaw) failures.push({ row: line, field: 'phone', message: 'Phone number is required' })
        else if (!phone) failures.push({ row: line, field: 'phone', message: 'Incomplete phone number — use a valid Nigerian number, e.g. 08012345678 or +234 801 234 5678' })

        if (!fullName) failures.push({ row: line, field: 'fullName', message: 'Full name is required' })
        if (!validator.isEmail(email)) failures.push({ row: line, field: 'email', message: 'Invalid email address' })
        if (seenEmails.has(email)) failures.push({ row: line, field: 'email', message: 'Duplicate email within file' })
        if (birthdayRaw) {
            try { parseBirthday(birthdayRaw) }
            catch { failures.push({ row: line, field: 'birthday', message: 'Invalid birthday — use DD/MM/YYYY' }) }
        }

        const rowHasErrors = failures.some(f => f.row === line)
        if (!rowHasErrors) {
            seenEmails.add(email)
            validRows.push({ line, fullName, email, phone, department: department.value, role, birthday: birthdayRaw ? parseBirthday(birthdayRaw) : null })
        }
    })
    return { validRows, failures, corrections }
}

module.exports = { parseCsvUsers }