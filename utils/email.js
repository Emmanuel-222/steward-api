const { Resend } = require('resend')
const nodemailer = require('nodemailer')
const AppError = require('./AppError')

const RESEND_API_KEY = process.env.RESEND_API_KEY
const MAILTRAP_HOST = process.env.MAILTRAP_HOST
const MAILTRAP_PORT = Number(process.env.MAILTRAP_PORT || 587)
const MAILTRAP_USER = process.env.MAILTRAP_USER
const MAILTRAP_PASS = process.env.MAILTRAP_PASS
const FROM_ADDRESS =
  process.env.FROM_ADDRESS || 'Steward Registrar <onboarding@resend.dev>'

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

// Mailtrap works for both the Email Testing sandbox
// (host sandbox.smtp.mailtrap.io) and Email Sending (host live.smtp.mailtrap.io).
const mailtrap =
  MAILTRAP_HOST && MAILTRAP_USER && MAILTRAP_PASS
    ? nodemailer.createTransport({
        host: MAILTRAP_HOST,
        port: MAILTRAP_PORT,
        auth: { user: MAILTRAP_USER, pass: MAILTRAP_PASS },
      })
    : null

async function sendEmail({ to, subject, html }) {
  if (mailtrap) {
    try {
      const info = await mailtrap.sendMail({ from: FROM_ADDRESS, to, subject, html })
      return { id: info.messageId, transport: 'mailtrap' }
    } catch (err) {
      console.log(`[email:mailtrap] failed: ${err.message ?? err}`)
      if (process.env.NODE_ENV === 'production') {
        throw new AppError('Could not deliver the email at this time', 502)
      }
    }
  }

  if (resend) {
    try {
      const { data, error } = await resend.emails.send({ from: FROM_ADDRESS, to, subject, html })
      if (error) throw error
      return data
    } catch (err) {
      if (process.env.NODE_ENV === 'production') {
        throw new AppError('Could not deliver the email at this time', 502)
      }
      console.log(`[email:dev] Resend rejected (${err.statusCode ?? ''} ${err.name ?? ''}): ${err.message ?? err}`)
    }
  }

  console.log(`[email:dev] to=${to} subject=${subject}\n${html}`)
  return { id: 'dev-mock' }
}

module.exports = { sendEmail }
