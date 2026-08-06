function parseBirthday(value) {
    if (value == null || String(value).trim() === '') return null
    const parts = String(value).trim().split('/')
    if (parts.length !== 3) throw new Error('invalid birthday format')
    const day = Number(parts[0])
    const month = Number(parts[1])
    const year = Number(parts[2])
    if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) throw new Error('invalid birthday')
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > new Date().getFullYear()) throw new Error('invalid birthday')
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('invalid birthday')
    return date
}

module.exports = { parseBirthday }
