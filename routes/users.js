const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const { body } = require('express-validator');

const prisma = new PrismaClient();
const bcrypt = require("bcrypt");
const authenticate = require("../middleware/authenticate");
const isAdmin = require("../middleware/isAdmin");
const handleValidation = require("../middleware/validate");

const createUserValidation = [
    body('fullName').trim().notEmpty().withMessage('Full name is required'),
    body('email').isEmail().withMessage('A valid email is required'),
    body('phone').trim().notEmpty().withMessage('Phone number is required'),
    body('department').trim().notEmpty().withMessage('Department is required'),
    body('role').trim().notEmpty().withMessage('Role is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    handleValidation,
]

const updateUserValidation = [
    body('fullName').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
    body('email').optional().isEmail().withMessage('A valid email is required'),
    body('phone').optional().trim().notEmpty().withMessage('Phone number cannot be empty'),
    body('department').optional().trim().notEmpty().withMessage('Department cannot be empty'),
    body('role').optional().trim().notEmpty().withMessage('Role cannot be empty'),
    handleValidation,
]

// Get all users
/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", authenticate, async (req, res) => {
  const { role, department } = req.user;
  
  let whereClause = {};
  if (role?.toLowerCase() === 'leader') {
    whereClause = { department: department };
  }

  const users = await prisma.user.findMany({
    where: whereClause,
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      department: true,
      role: true,
      createdAt: true,
    },
  });
  res.json(users);
});

router.get("/search/:name", authenticate, async (req, res) => {
  const search = req.params.name;

  if (!search || search.trim() === "") {
    return res.status(400).json({ message: "Search term is required" });
  }

  const users = await prisma.user.findMany({
    where: {
      OR: [
        {
          fullName: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          department: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          role: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          phone: {
            contains: search,
            mode: "insensitive",
          },
        },
      ],
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      department: true,
      role: true,
      createdAt: true,
    },
  });

  res.json(users);
});

// Get a single user
/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get a single user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/:id", authenticate, async (req, res) => {
  const id = Number(req.params.id);
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      department: true,
      role: true,
      createdAt: true,
    },
  });
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

// Create new user only admin can do this
/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserRequest'
 *     responses:
 *       201:
 *         description: User created
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/", authenticate, isAdmin, createUserValidation, async (req, res) => {
  const { fullName, email, phone, department, role, password } = req.body;
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });
  if (existingUser)
    return res.status(400).json({ message: "Email already in use" });
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      fullName,
      email,
      phone,
      department,
      role,
      password: hashedPassword,
    },
  });
  res
    .status(201)
    .json({ message: "User created successfully", userId: user.id });
});

// update users in the system, only admin can do this
/**
 * @swagger
 * /users/{id}:
 *   patch:
 *     summary: Update a user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUserRequest'
 *     responses:
 *       200:
 *         description: User updated
 *       400:
 *         description: Invalid update request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch("/:id", authenticate, isAdmin, updateUserValidation, async (req, res) => {
  const id = Number(req.params.id);
  const { fullName, email, phone, department, role } = req.body;
  const existingUser = await prisma.user.findUnique({
    where: { id },
  });
  if (!existingUser) return res.status(404).json({ message: "User not found" });
  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      fullName: fullName || existingUser.fullName, //replace with the new from the body, else just leave it has it was before on our database.
      email: email || existingUser.email,
      phone: phone || existingUser.phone,
      department: department || existingUser.department,
      role: role || existingUser.role,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      department: true,
      phone: true,
      updatedAt: true,
    },
  });
  res.json({ message: "User updated successfully", updatedUser });
});

// delete user from the db
/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete a user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User deleted
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete("/:id", authenticate, isAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const existingUser = await prisma.user.findUnique({
    where: { id },
  });
  if (!existingUser) return res.status(404).json({ message: "User not found" });
  await prisma.user.delete({
    where: { id },
  });
  res.json({ message: "User deleted successfully" });
});

module.exports = router;
