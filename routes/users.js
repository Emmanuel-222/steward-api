const express = require("express");
const router = express.Router();
const { body } = require('express-validator');
const { prisma } = require('../prisma');

const bcrypt = require("bcrypt");
const authenticate = require("../middleware/authenticate");
const isAdmin = require("../middleware/isAdmin");
const handleValidation = require("../middleware/validate");
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { success, created } = require('../utils/response');

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
router.get("/", authenticate, asyncHandler(async (req, res) => {
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
  return success(res, users);
}));

router.get("/search/:name", authenticate, asyncHandler(async (req, res) => {
  const search = req.params.name;

  if (!search || search.trim() === "") {
    throw new AppError("Search term is required", 400);
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

  return success(res, users);
}));

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
router.get("/:id", authenticate, asyncHandler(async (req, res) => {
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
  if (!user) throw new AppError("User not found", 404);
  return success(res, user);
}));

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
router.post("/", authenticate, isAdmin, createUserValidation, asyncHandler(async (req, res) => {
  const { fullName, email, phone, department, role, password } = req.body;
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });
  if (existingUser)
    throw new AppError("Email already in use", 400);
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
  return created(res, { userId: user.id }, "User created successfully");
}));

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
router.patch("/:id", authenticate, isAdmin, updateUserValidation, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { fullName, email, phone, department, role } = req.body;
  const existingUser = await prisma.user.findUnique({
    where: { id },
  });
  if (!existingUser) throw new AppError("User not found", 404);
  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      fullName: fullName || existingUser.fullName,
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
  return success(res, { updatedUser }, "User updated successfully");
}));

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
router.delete("/:id", authenticate, isAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existingUser = await prisma.user.findUnique({
    where: { id },
  });
  if (!existingUser) throw new AppError("User not found", 404);
  await prisma.user.delete({
    where: { id },
  });
  return success(res, null, "User deleted successfully");
}));

module.exports = router;
