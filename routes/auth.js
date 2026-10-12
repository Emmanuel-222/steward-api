const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const { body } = require('express-validator')
const { PASSWORD_POLICY_REGEX, PASSWORD_ERROR_MESSAGE } = require('../utils/passwordPolicy')
const authenticate = require('../middleware/authenticate')
const handleValidation = require('../middleware/validate')
const { prisma } = require('../prisma')
const asyncHandler = require('../utils/asyncHandler')
const AppError = require('../utils/AppError')
const { success } = require('../utils/response')
const { sendEmail } = require('../utils/email')
const { DEFAULT_PASSWORD } = require('../utils/constants')
const { buildOnboarding, isWithinRotationGrace } = require('../utils/authSession')
const { buildVerifyEmail } = require('../utils/emailTemplates')
const { normalizeDepartment } = require('../utils/normalize')

const JWT_SECRET = process.env.JWT_SECRET
const ACCESS_TOKEN_EXPIRY = '30m'
const REFRESH_TOKEN_EXPIRY_DAYS = 7
const REFRESH_COOKIE_NAME = 'refresh_token'
const REFRESH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
}

function refreshCookieOptions(expiresAt) {
    return { ...REFRESH_COOKIE_OPTIONS, maxAge: Math.max(0, expiresAt.getTime() - Date.now()) }
}

// The default-password check must be applied everywhere onboarding is reported,
// otherwise a reload (which goes through /auth/refresh) skips the forced change.
async function onboardingFor(user) {
    const passwordMatchesDefault = user?.password
        ? await bcrypt.compare(DEFAULT_PASSWORD, user.password)
        : false
    return buildOnboarding(user, passwordMatchesDefault)
}

async function generateRefreshToken(userId, expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)) {
    const token = crypto.randomBytes(40).toString('hex')
    await prisma.refreshToken.create({
        data: { token, userId, expiresAt }
    })
    return token
}

// Walk the rotation chain (old -> replacedBy -> ...) to the newest token that is still live.
async function resolveActiveSuccessor(stored) {
    let current = stored
    for (let hops = 0; hops < 5; hops += 1) {
        if (!current.replacedBy) return null
        const next = await prisma.refreshToken.findUnique({ where: { token: current.replacedBy } })
        if (!next || next.expiresAt < new Date()) return null
        if (!next.revoked) return next
        current = next
    }
    return null
}

// Revoke a user's other sessions (e.g. after a password change) while keeping the current one.
async function revokeOtherRefreshTokens(userId, keepToken) {
    await prisma.refreshToken.updateMany({
        where: {
            userId,
            revoked: false,
            ...(keepToken ? { token: { not: keepToken } } : {}),
        },
        data: { revoked: true, revokedAt: new Date() },
    })
}


/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login a user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/login', [
    body('email').isEmail().withMessage('A valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    handleValidation,
], asyncHandler(async (req, res) => {
    const { email, password } = req.body
    const existingUser = await prisma.user.findUnique({where: { email } })
    if(!existingUser) {
        throw new AppError('Invalid credentials', 401)
    }
    const passwordMatch = await bcrypt.compare(password, existingUser.password)
    if(!passwordMatch) {
        throw new AppError('Invalid credentials', 401)
    }
    const token = jwt.sign(
        { 
            userId: existingUser.id, 
            email: existingUser.email, 
            role: existingUser.role,
            department: existingUser.department 
        },
        JWT_SECRET,   
        { expiresIn: ACCESS_TOKEN_EXPIRY }
    )
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    const refreshToken = await generateRefreshToken(existingUser.id, refreshExpiresAt)
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(refreshExpiresAt))
    return success(res, {
        token,
        user: {
            id: existingUser.id,
            email: existingUser.email,
            name: existingUser.fullName,
            role: existingUser.role,
            department: existingUser.department,
            onboarding: await onboardingFor(existingUser),
        }
    }, 'Login is successful')
}))

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     description: Reads the httpOnly refresh_token cookie, rotates it and issues a new access token.
 *     responses:
 *       200:
 *         description: Tokens refreshed
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', asyncHandler(async (req, res) => {
    const refreshToken = req.cookies[REFRESH_COOKIE_NAME]
    if (!refreshToken) {
        throw new AppError('Invalid or expired refresh token', 401)
    }
    let stored = await prisma.refreshToken.findUnique({
        where: { token: refreshToken }
    })
    if (!stored || stored.expiresAt < new Date()) {
        throw new AppError('Invalid or expired refresh token', 401)
    }

    let shouldRotate = false
    if (stored.revoked) {
        if (!isWithinRotationGrace(stored.revokedAt)) {
            // Reuse of a token revoked long ago (or by logout) — treat as theft and
            // revoke the whole family for this user.
            await prisma.refreshToken.updateMany({
                where: { userId: stored.userId, revoked: false },
                data: { revoked: true, revokedAt: new Date() },
            })
            throw new AppError('Invalid or expired refresh token', 401)
        }
        // Superseded moments ago by a concurrent refresh (e.g. another tab): reuse the
        // token we already issued instead of failing the request.
        const successor = await resolveActiveSuccessor(stored)
        if (!successor) {
            throw new AppError('Invalid or expired refresh token', 401)
        }
        stored = successor
    } else {
        shouldRotate = true
    }

    const user = await prisma.user.findUnique({ where: { id: stored.userId } })
    if (!user) {
        throw new AppError('User not found', 404)
    }

    const newAccessToken = jwt.sign(
        {
            userId: user.id,
            email: user.email,
            role: user.role,
            department: user.department
        },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
    )

    let activeRefreshToken = stored
    if (shouldRotate) {
        const issuedToken = await generateRefreshToken(user.id, stored.expiresAt)
        await prisma.refreshToken.update({
            where: { id: stored.id },
            data: { revoked: true, revokedAt: new Date(), replacedBy: issuedToken },
        })
        activeRefreshToken = { token: issuedToken, expiresAt: stored.expiresAt }
    }
    res.cookie(REFRESH_COOKIE_NAME, activeRefreshToken.token, refreshCookieOptions(activeRefreshToken.expiresAt))

    return success(res, {
        token: newAccessToken,
        user: {
            id: user.id,
            email: user.email,
            name: user.fullName,
            role: user.role,
            department: user.department,
            onboarding: await onboardingFor(user),
        }
    }, 'Tokens refreshed')
}))

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout and revoke refresh token
 *     tags: [Auth]
 *     description: Revokes the refresh_token cookie and clears it.
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/logout', asyncHandler(async (req, res) => {
    const refreshToken = req.cookies[REFRESH_COOKIE_NAME]
    if (refreshToken) {
        await prisma.refreshToken.updateMany({
            where: { token: refreshToken, revoked: false },
            data: { revoked: true, revokedAt: new Date() }
        })
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { ...REFRESH_COOKIE_OPTIONS })
    return success(res, null, 'Logged out successfully')
}))

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved
 *       401:
 *         description: Not authenticated
 */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.userId }
    })
    
    if (!user) {
        throw new AppError('User not found', 404)
    }
    
    return success(res, {
        id: user.id,
        email: user.email,
        name: user.fullName,
        role: user.role,
        department: user.department,
        onboarding: await onboardingFor(user),
    })
}))

router.patch('/change-password', authenticate, [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').matches(PASSWORD_POLICY_REGEX).withMessage(PASSWORD_ERROR_MESSAGE),
    handleValidation,
], asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) throw new AppError('User not found', 404)

    const passwordMatch = await bcrypt.compare(currentPassword, user.password)
    if (!passwordMatch) throw new AppError('Current password is incorrect', 400)

    const normalized = newPassword.trim()
    if (normalized.length < 8) throw new AppError('Password must be at least 8 characters', 400)
    if (normalized.toLowerCase() === DEFAULT_PASSWORD.toLowerCase()) {
        throw new AppError('New password cannot be the default password', 400)
    }
    if (await bcrypt.compare(normalized, user.password)) {
        throw new AppError('New password must be different from the current password', 400)
    }

    const hashedPassword = await bcrypt.hash(normalized, 10)
    await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, mustChangePassword: false },
    })
    await revokeOtherRefreshTokens(user.id, req.cookies[REFRESH_COOKIE_NAME])

    return success(res, null, 'Password changed successfully')
}))

const codeCooldowns = new Map() // userId -> last send timestamp (ms)

router.post('/onboarding/send-code', authenticate, asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) throw new AppError('User not found', 404)
    if (user.emailVerified) throw new AppError('Email is already verified', 409)

    const last = codeCooldowns.get(user.id) ?? 0
    if (Date.now() - last < 60_000) {
        throw new AppError('Please wait 60 seconds before requesting another code', 429)
    }

    const code = String(crypto.randomInt(100000, 1000000))
    const codeHash = await bcrypt.hash(code, 10)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    await prisma.$transaction([
        prisma.verificationCode.updateMany({
            where: { userId: user.id, consumed: false },
            data: { consumed: true },
        }),
        prisma.verificationCode.create({
            data: { userId: user.id, codeHash, expiresAt },
        }),
    ])
    codeCooldowns.set(user.id, Date.now())

    await sendEmail({
        to: user.email,
        subject: 'Your Steward Registrar verification code',
        html: `<p>Hi ${user.fullName},</p><p>Your verification code is:</p><h2>${code}</h2><p>It expires in 10 minutes.</p>`,
    })

    return success(res, null, 'Verification code sent')
}))

router.patch('/onboarding', authenticate, [
    body('newPassword').matches(PASSWORD_POLICY_REGEX).withMessage(PASSWORD_ERROR_MESSAGE),
    handleValidation,
], asyncHandler(async (req, res) => {
    const { code, newPassword } = req.body
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) throw new AppError('User not found', 404)

    const passwordMatchesDefault = await bcrypt.compare(DEFAULT_PASSWORD, user.password)
    if (user.emailVerified && !user.mustChangePassword && !passwordMatchesDefault) {
        throw new AppError('Nothing to complete', 403)
    }

    if (!user.emailVerified) {
        const devOtp = process.env.DEV_OTP
        const isDevBypass = Boolean(devOtp) && typeof code === 'string' && code === devOtp
        if (!isDevBypass) {
            const record = await prisma.verificationCode.findFirst({
                where: { userId: user.id, consumed: false },
                orderBy: { createdAt: 'desc' },
            })
            if (!record || record.expiresAt < new Date()) {
                throw new AppError('Invalid or expired code', 400)
            }
            if (record.attempts >= 5) {
                throw new AppError('Too many attempts. Request a new code.', 400)
            }
            if (typeof code !== 'string' || !(await bcrypt.compare(code, record.codeHash))) {
                await prisma.verificationCode.update({
                    where: { id: record.id },
                    data: { attempts: { increment: 1 } },
                })
                throw new AppError('Invalid or expired code', 400)
            }
        }
    }

    const normalized = newPassword.trim()
    if (normalized.length < 8) throw new AppError('Password must be at least 8 characters', 400)
    if (normalized.toLowerCase() === DEFAULT_PASSWORD.toLowerCase()) {
        throw new AppError('New password cannot be the default password', 400)
    }
    if (await bcrypt.compare(normalized, user.password)) {
        throw new AppError('New password must be different from the current password', 400)
    }

    const hashedPassword = await bcrypt.hash(normalized, 10)

    await prisma.$transaction([
        prisma.verificationCode.updateMany({
            where: { userId: user.id, consumed: false },
            data: { consumed: true },
        }),
        prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword, emailVerified: true, mustChangePassword: false },
        }),
    ])
    await revokeOtherRefreshTokens(user.id, req.cookies[REFRESH_COOKIE_NAME])

    return success(res, {
        id: user.id,
        email: user.email,
        name: user.fullName,
        role: user.role,
        department: user.department,
        onboarding: buildOnboarding({ emailVerified: true, mustChangePassword: false }, false),
    }, 'Onboarding complete')
}))

// Forgot password - request reset token (public, rate-limited)
router.post('/forgot-password', [
    body('email').isEmail().withMessage('A valid email is required'),
    handleValidation,
], asyncHandler(async (req, res) => {
    const { email } = req.body
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
        // Don't reveal if email exists - always return success
        return success(res, null, 'If an account exists, a reset link has been sent')
    }

    const resetToken = jwt.sign(
        { userId: user.id, purpose: 'password-reset' },
        JWT_SECRET,
        { expiresIn: '15m' }
    )

    const resetUrl = `${process.env.FRONTEND_URL || 'https://steward-fe.pages.dev'}/reset-password?token=${resetToken}`

    await sendEmail({
        to: user.email,
        subject: 'Steward Registrar - Password Reset',
        html: `
            <p>Hi ${user.fullName},</p>
            <p>You requested a password reset. Click the link below to set a new password:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>This link expires in 15 minutes.</p>
            <p>If you didn't request this, please ignore this email.</p>
        `,
    })

    return success(res, null, 'If an account exists, a reset link has been sent')
}))

// Reset password with token (public)
router.post('/reset-password', [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('newPassword').matches(PASSWORD_POLICY_REGEX).withMessage(PASSWORD_ERROR_MESSAGE),
    handleValidation,
], asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body

    let payload
    try {
        payload = jwt.verify(token, JWT_SECRET)
    } catch {
        throw new AppError('Invalid or expired reset token', 400)
    }

    if (payload.purpose !== 'password-reset') {
        throw new AppError('Invalid reset token', 400)
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (!user) throw new AppError('User not found', 404)

    const normalized = newPassword.trim()
    if (normalized.length < 8) throw new AppError('Password must be at least 8 characters', 400)
    if (normalized.toLowerCase() === DEFAULT_PASSWORD.toLowerCase()) {
        throw new AppError('New password cannot be the default password', 400)
    }
    if (await bcrypt.compare(normalized, user.password)) {
        throw new AppError('New password must be different from the current password', 400)
    }

    const hashedPassword = await bcrypt.hash(normalized, 10)
    await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, mustChangePassword: false },
    })
    await revokeOtherRefreshTokens(user.id)

    return success(res, null, 'Password reset successful')
}))

// Self-service signup — creates a steward account pending email verification (public, rate-limited)
router.post('/signup', [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('A valid email is required'),
    body('department').trim().notEmpty().withMessage('Department is required'),
    body('password').matches(PASSWORD_POLICY_REGEX).withMessage(PASSWORD_ERROR_MESSAGE),
    handleValidation,
], asyncHandler(async (req, res) => {
    const { firstName, lastName, email, department, password } = req.body
    const normalizedEmail = email.trim().toLowerCase()

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
        throw new AppError('An account with that email already exists', 409)
    }

    const normalizedDepartment = normalizeDepartment(department)
    if (!normalizedDepartment.value) {
        throw new AppError(`Unknown department — did you mean '${normalizedDepartment.suggestion}'?`, 400)
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
        data: {
            fullName: `${firstName.trim()} ${lastName.trim()}`.trim(),
            email: normalizedEmail,
            phone: '',
            department: normalizedDepartment.value,
            role: 'steward',
            password: hashedPassword,
            emailVerified: false,
            mustChangePassword: false,
        },
    })

    const verifyToken = jwt.sign(
        { userId: user.id, purpose: 'email-verify' },
        JWT_SECRET,
        { expiresIn: '24h' }
    )
    const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${verifyToken}`
    try {
        await sendEmail({ to: user.email, ...buildVerifyEmail({ name: user.fullName, url: verifyUrl }) })
    } catch (error) {
        // The account still exists; the user can verify later from the onboarding screen.
        console.error('[auth] signup verification email failed:', error.message ?? error)
    }

    return success(res, { email: user.email }, 'Account created. Check your email to verify it.')
}))

// Verify a signup email using the token from the verification link (public)
router.post('/verify-email/:token', asyncHandler(async (req, res) => {
    let payload
    try {
        payload = jwt.verify(req.params.token, JWT_SECRET)
    } catch {
        throw new AppError('This verification link is invalid or has expired', 400)
    }

    if (payload.purpose !== 'email-verify') {
        throw new AppError('This verification link is invalid', 400)
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (!user) throw new AppError('User not found', 404)

    if (!user.emailVerified) {
        await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })
    }

    return success(res, null, 'Email verified successfully')
}))

module.exports = router
