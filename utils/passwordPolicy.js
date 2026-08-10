const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/

const PASSWORD_ERROR_MESSAGE =
  'Use a stronger password: at least 8 characters, with an uppercase letter, a number, and a symbol'

function passwordMeetsPolicy(password) {
    return typeof password === 'string' && PASSWORD_POLICY_REGEX.test(password)
}

module.exports = { PASSWORD_POLICY_REGEX, PASSWORD_ERROR_MESSAGE, passwordMeetsPolicy }