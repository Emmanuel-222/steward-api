const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { body } = require('express-validator')
const authenticate = require('../middleware/authenticate')
const handleValidation = require('../middleware/validate')
const { prisma } = require('../prisma')
const asyncHandler = require('../utils/asyncHandler')
const AppError = require('../utils/AppError')
const { success } = require('../utils/response')

const JWT_SECRET = process.env.JWT_SECRET

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
        { expiresIn: '24h' }
    )
    return success(res, {
        token,
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
