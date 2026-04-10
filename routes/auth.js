const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

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
        { userId: existingUser.id, email: existingUser.email, role: existingUser.role },  //payload sent 
        JWT_SECRET,   
        { expiresIn: '24h' }   //time for token to expire 
    )
    res.status(200).json({ message: 'Login is successful', token})
})

module.exports = router
