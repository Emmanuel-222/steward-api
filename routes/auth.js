const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const authenticate = require('../middleware/authenticate')

const prisma = new PrismaClient()
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
router.post('/login', async (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' })
    }
    const existingUser = await prisma.user.findUnique({where: { email } }) //check if user email exist already
    if(!existingUser) {
        return res.status(401).json({ message: 'Invalid credentials'})
    }
    const passwordMatch = await bcrypt.compare(password, existingUser.password)
    if(!passwordMatch) {
        return res.status(401).json({ message: 'Invalid credentials'})
    }
    //WHen the password which is the last thing to check when login in is correct, then we sign a token from the server for that user contain things we will define when signing.
    const token = jwt.sign(
        { 
            userId: existingUser.id, 
            email: existingUser.email, 
            role: existingUser.role,
            department: existingUser.department 
        },  //payload sent 
        JWT_SECRET,   
        { expiresIn: '24h' }   //time for token to expire 
    )
    res.status(200).json({ 
        message: 'Login is successful', 
        token,
        user: {
            id: existingUser.id,
            email: existingUser.email,
            name: existingUser.fullName,
            role: existingUser.role,
            department: existingUser.department
        }
    })
})

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
router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId }
        })
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' })
        }
        
        res.status(200).json({
            id: user.id,
            email: user.email,
            name: user.fullName,
            role: user.role
        })
    } catch (err) {
        res.status(500).json({ message: 'Error fetching profile' })
    }
})

module.exports = router
