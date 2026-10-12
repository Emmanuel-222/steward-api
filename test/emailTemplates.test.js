const { test } = require('node:test')
const assert = require('node:assert')
const { buildVerifyEmail } = require('../utils/emailTemplates')

test('buildVerifyEmail includes the verification link', () => {
  const email = buildVerifyEmail({ name: 'Ada Obi', url: 'http://localhost:5173/verify-email/abc123' })
  assert.match(email.subject, /verify/i)
  assert.match(email.html, /http:\/\/localhost:5173\/verify-email\/abc123/)
})

test('buildVerifyEmail escapes the recipient name', () => {
  const email = buildVerifyEmail({ name: '<script>x</script>', url: 'http://example.com/v' })
  assert.doesNotMatch(email.html, /<script>/)
  assert.match(email.html, /&lt;script&gt;/)
})
