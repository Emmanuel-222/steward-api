const { Resend } = require('resend')
const AppError = require('./AppError')

const API_KEY = process.env.RESEND_API_KEY
const FROM_ADDRESS =
  process.env.FROM_ADDRESS || 'Steward Registrar <onboarding@resend.dev>'

let resend = null
if (API_KEY) {
    resend = new Resend(API_KEY)
}

async function sendEmail({ to, subject, html }) {
    if (!resend) {
        console.log(`[email:dev] to=${to} subject=${subject}\n${html}`)
        return { id: 'dev-mock' }
    }
    try {
        const { data, error } = await resend.emails.send({
            from: FROM_ADDRESS,
            to,
            subject,
            html,
        })
        if (error) throw error
        return data
    } catch (err) {
        if (process.env.NODE_ENV === 'production') {
            throw new AppError('Could not deliver the email at this time', 502)
        }
        console.log(`[email:dev] Resend rejected (${err.statusCode ?? ''} ${err.name ?? ''}): ${err.message ?? err}`)
        console.log(`[email:dev] to=${to} subject=${subject}\n${html}`)
        return { id: 'dev-mock' }
    }
}

module.exports = { sendEmail }