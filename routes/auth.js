const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const { body } = require('express-validator')
const authenticate = require('../middleware/authenticate')
const handleValidation = require('../middleware/validate')
const { prisma } = require('../prisma')
const asyncHandler = require('../utils/asyncHandler')
const AppError = require('../utils/AppError')
const { success } = require('../utils/response')

const JWT_SECRET = process.env.JWT_SECRET
const ACCESS_TOKEN_EXPIRY = '6h'
const REFRESH_TOKEN_EXPIRY_DAYS = 7

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
            department: existingUser.department
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
            department: user.department
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
        role: user.role
    })
}))

module.exports = router
