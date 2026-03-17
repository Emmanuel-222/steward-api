const express = require('express')
const router = express.Router()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const bcrypt = require('bcrypt')
const authenticate = require('../middleware/authenticate')
const isAdmin = require('../middleware/isAdmin')

// Get all users
router.get('/', authenticate, async (req, res) => {
    const users = await prisma.user.findMany({
        select: {  //to select specific value from the user table on my Database
            id: true,
            fullName: true,
            email: true,
            phone: true,
            department: true,
            role: true,
            createdAt: true,
        } //In this place we return all the useful data execpt password, even though password is hashed
    })
    res.json(users)
})

// Get a single user
router.get('/:id', authenticate, async (req, res) => {
    const id = Number(req.params.id)
    const user = await prisma.user.findUnique({
        where: { id },
        select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            department: true,
            role: true,
            createdAt: true
        }
    })
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json(user)
})

// Create new user only admin can do this
router.post('/', authenticate, isAdmin, async (req, res) => {
    const { fullName, email, phone, department, role, password } = req.body
    if (!fullName || !email || !phone || !department || !role || !password) return res.status(400).json({ message: 'All field is required!' })
    const existingUser = await prisma.user.findUnique({
        where: { email }
    })
    if (existingUser) return res.status(400).json({ message: 'Email already in use' })
    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
        data: {
            fullName, email, phone, department, role, password: hashedPassword
        }
    })
    res.status(201).json({ message: 'User created successfully', userId: user.id })
})

// update users in the system, only admin can do this
router.patch('/:id', authenticate, isAdmin, async (req, res) => {
    const id = Number(req.params.id)
    const { fullName, email, phone, department, role } = req.body
    // To check if at least one field was changed before I query the db to update just that part, that's why we use Patch
    if( !fullName && !email && !phone && !department && !role ) return res.status(400).json({ message: "At least one field is required to update" })
    const existingUser = await prisma.user.findUnique({
        where: { id }
    })
    if (!existingUser) return res.status(404).json({ message: 'User not found' })
    const updatedUser = await prisma.user.update({
        where: { id },
        data: {
            fullName: fullName || existingUser.fullName,  //replace with the new from the body, else just leave it has it was before on our database.
            email: email || existingUser.email,
            phone: phone || existingUser.phone,
            department: department || existingUser.department,
            role: role || existingUser.role
        },
        select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            department: true,
            phone: true,
            updatedAt: true
        }
    })
    res.json({ message: 'User updated successfully', updatedUser })
})

// delete user from the db
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
    const id = Number(req.params.id)
    const existingUser = await prisma.user.findUnique({
        where: { id }
    })
    if (!existingUser) return res.status(404).json({ message: 'User not found' })
    await prisma.user.delete({
        where: { id }
    })
    res.json({ message: 'User deleted successfully' })
})

module.exports = router