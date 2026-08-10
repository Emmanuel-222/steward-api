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

const JWT_SECRET = process.env.JWT_SECRET
const ACCESS_TOKEN_EXPIRY = '6h'
const REFRESH_TOKEN_EXPIRY_DAYS = 7

function onboardingPayload(user, passwordMatchesDefault = false) {
    const needsEmailVerify = !user.emailVerified
    const needsPasswordChange = user.mustChangePassword || passwordMatchesDefault
    return {
        required: needsEmailVerify || needsPasswordChange,
        needsEmailVerify,
        needsPasswordChange,
    }
}

async function generateRefreshToken(userId) {
    const token = crypto.randomBytes(40).toString('hex')
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    await prisma.refreshToken.create({
        data: { token, userId, expiresAt }
    })
    return token
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
    const passwordMatchesDefault = await bcrypt.compare(DEFAULT_PASSWORD, existingUser.password)
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
    const refreshToken = await generateRefreshToken(existingUser.id)
    return success(res, {
        token,
        refreshToken,
        user: {
            id: existingUser.id,
            email: existingUser.email,
            name: existingUser.fullName,
            role: existingUser.role,
            department: existingUser.department,
            onboarding: onboardingPayload(existingUser, passwordMatchesDefault),
        }
    }, 'Login is successful')
}))

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tokens refreshed
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', [
    body('refreshToken').notEmpty().withMessage('Refresh token is required'),
    handleValidation,
], asyncHandler(async (req, res) => {
    const { refreshToken } = req.body
    const stored = await prisma.refreshToken.findUnique({
        where: { token: refreshToken }
    })
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
        throw new AppError('Invalid or expired refresh token', 401)
    }

    // Revoke the old token (rotation)
    await prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revoked: true }
    })

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
    const newRefreshToken = await generateRefreshToken(user.id)

    return success(res, {
        token: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
            id: user.id,
            email: user.email,
            name: user.fullName,
            role: user.role,
            department: user.department,
            onboarding: onboardingPayload(user),
        }
    }, 'Tokens refreshed')
}))

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout and revoke refresh token
 *     tags: [Auth]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/logout', asyncHandler(async (req, res) => {
    const { refreshToken } = req.body
    if (refreshToken) {
        await prisma.refreshToken.updateMany({
            where: { token: refreshToken, revoked: false },
            data: { revoked: true }
        })
    }
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
        onboarding: onboardingPayload(user),
    })
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

    return success(res, {
        id: user.id,
        email: user.email,
        name: user.fullName,
        role: user.role,
        department: user.department,
        onboarding: onboardingPayload({ emailVerified: true, mustChangePassword: false }),
    }, 'Onboarding complete')
}))

module.exports = router
