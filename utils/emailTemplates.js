const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

function escape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function formatSessionDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value ?? '')
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  })
}

function shell({ title, intro, details, cta, footer = 'Sent by the Steward Registrar training scheduler.' }) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#eef2f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f2d52;">
    <div style="max-width:520px;margin:0 auto;padding:32px 16px;">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <div style="background:#0d2d52;padding:18px 24px;">
          <p style="margin:0;color:#ffffff;font-size:15px;font-weight:600;letter-spacing:0.02em;">The Registrar</p>
        </div>
        <div style="padding:24px;">
          <h1 style="margin:0 0 10px;font-size:20px;line-height:1.3;color:#0d2d52;">${title}</h1>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">${intro}</p>
          ${details}
          ${cta}
        </div>
      </div>
      <p style="margin:16px 4px 0;font-size:12px;color:#64748b;">${footer}</p>
    </div>
  </body>
</html>`
}

function detailsBlock(session) {
  const rows = [
    ['Cohort', session.cohortName],
    ['Session', `Week ${session.week}${session.topic ? ` · ${session.topic}` : ''}`],
    ['Date', session.date ? formatSessionDate(session.date) : 'To be confirmed'],
    ['Time', session.endTime ? `${session.startTime}–${session.endTime}` : session.startTime],
    ['Location', session.location || 'To be confirmed'],
  ]
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0;">
    ${rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:6px 0;font-size:13px;color:#64748b;width:92px;">${label}</td><td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600;">${escape(value)}</td></tr>`,
      )
      .join('')}
  </table>`
}

const ctaButton = `<a href="${FRONTEND_URL}/dashboard/teaching" style="display:inline-block;background:#0d2d52;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:12px;">View your classes</a>`

function firstName(fullName) {
  return String(fullName ?? '').trim().split(/\s+/)[0] || 'there'
}

function buildAssignmentEmail(session) {
  return {
    subject: `You're teaching ${session.cohortName} · Week ${session.week}`,
    html: shell({
      title: `You're teaching a session, ${escape(firstName(session.teacherName))}`,
      intro: 'You have been assigned as the teacher for this training session.',
      details: detailsBlock(session),
      cta: ctaButton,
    }),
  }
}

function buildRemovalEmail(session) {
  return {
    subject: `You've been removed from ${session.cohortName} · Week ${session.week}`,
    html: shell({
      title: 'Session reassigned',
      intro: `You are no longer the teacher for <strong>Week ${session.week}${session.topic ? ` · ${escape(session.topic)}` : ''}</strong> (${escape(session.cohortName)}).`,
      details: detailsBlock(session),
      cta: ctaButton,
    }),
  }
}

function buildReminderEmail(session, offset) {
  const when = offset === 1 ? 'tomorrow' : `in ${offset} days`
  return {
    subject: `Reminder: ${session.cohortName} · Week ${session.week} is ${when}`,
    html: shell({
      title: `Your session is ${when}, ${escape(firstName(session.teacherName))}`,
      intro: 'You are the teacher for this session. Please be ready to lead it.',
      details: detailsBlock(session),
      cta: ctaButton,
    }),
  }
}

function buildVerifyEmail({ name, url }) {
  return {
    subject: 'Verify your Steward Registrar email',
    html: shell({
      title: `Welcome, ${escape(firstName(name))}`,
      intro: 'Confirm your email address to activate your Steward Registrar account. This link expires in 24 hours.',
      details: '',
      cta: `<a href="${url}" style="display:inline-block;background:#0d2d52;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:12px;">Verify my email</a>`,
      footer: 'If you did not create a Steward Registrar account, you can safely ignore this email.',
    }),
  }
}

module.exports = { buildAssignmentEmail, buildRemovalEmail, buildReminderEmail, buildVerifyEmail }
