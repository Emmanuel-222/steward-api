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
const { parseBirthday } = require('../utils/birthday');
const multer = require('multer')
const { parseCsvUsers } = require('../utils/csvImport')

const { DEFAULT_PASSWORD } = require('../utils/constants')

const birthdayIsValid = (value) => {
    if (value === undefined || value === null || String(value).trim() === '') return true
    try {
        parseBirthday(value)
        return true
    } catch {
        return false
    }
}

const createUserValidation = [
    body('fullName').trim().notEmpty().withMessage('Full name is required'),
    body('email').isEmail().withMessage('A valid email is required'),
    body('phone').trim().notEmpty().withMessage('Phone number is required'),
    body('department').trim().notEmpty().withMessage('Department is required'),
    body('role').trim().notEmpty().withMessage('Role is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('birthday').optional().custom(birthdayIsValid).withMessage('Birthday must be a valid date in DD/MM/YYYY format'),
    handleValidation,
]

const updateUserValidation = [
    body('fullName').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
    body('email').optional().isEmail().withMessage('A valid email is required'),
    body('phone').optional().trim().notEmpty().withMessage('Phone number cannot be empty'),
    body('department').optional().trim().notEmpty().withMessage('Department cannot be empty'),
    body('role').optional().trim().notEmpty().withMessage('Role cannot be empty'),
    body('birthday').optional().custom(birthdayIsValid).withMessage('Birthday must be a valid date in DD/MM/YYYY format'),
    handleValidation,
]

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const isCsv = file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')
        cb(isCsv ? null : new AppError('Only CSV files are allowed', 400), isCsv)
    },
})

function uploadCsv(req, res, next) {
    upload.single('file')(req, res, (err) => {
        if (!err) return next()
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return next(new AppError('File too large — max 1MB', 400))
        }
        next(err)
    })
}

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
 *               $ref: '#/components/schemas/UserList'
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
  if (['leader', 'pastor'].includes(role?.toLowerCase())) {
    whereClause = { department: department };
  }
  if (req.query.role && typeof req.query.role === 'string') {
    whereClause.role = { equals: req.query.role, mode: 'insensitive' };
  }

  const page = req.query.page ? Math.max(1, parseInt(req.query.page)) : null;
  const limit = page ? Math.min(100, Math.max(1, parseInt(req.query.limit) || 20)) : null;
  const skip = page ? (page - 1) * limit : undefined;
  const take = page ? limit : undefined;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: whereClause,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        department: true,
        role: true,
        birthday: true,
        createdAt: true,
      },
    }),
    page ? prisma.user.count({ where: whereClause }) : Promise.resolve(0),
  ]);

  return success(res, {
    items: users,
    pagination: page ? { total, page, limit, totalPages: Math.ceil(total / limit) } : null,
  });
}));

router.get("/search/:name", authenticate, asyncHandler(async (req, res) => {
  const search = req.params.name;
  const { role, department } = req.user;

  if (!search || search.trim() === "") {
    throw new AppError("Search term is required", 400);
  }

  const searchWhere = {
    OR: [
      { fullName: { contains: search, mode: "insensitive" } },
      { department: { contains: search, mode: "insensitive" } },
      { role: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
    ],
  };

  let whereClause = searchWhere;
  if (['leader', 'pastor'].includes(role?.toLowerCase())) {
    whereClause = { ...searchWhere, department };
  }
  if (req.query.role && typeof req.query.role === 'string') {
    whereClause = { ...whereClause, role: { equals: req.query.role, mode: 'insensitive' } };
  }

  const page = req.query.page ? Math.max(1, parseInt(req.query.page)) : null;
  const limit = page ? Math.min(100, Math.max(1, parseInt(req.query.limit) || 20)) : null;
  const skip = page ? (page - 1) * limit : undefined;
  const take = page ? limit : undefined;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: whereClause,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        department: true,
        role: true,
        birthday: true,
        createdAt: true,
      },
    }),
    page ? prisma.user.count({ where: whereClause }) : Promise.resolve(0),
  ]);

  return success(res, {
    items: users,
    pagination: page ? { total, page, limit, totalPages: Math.ceil(total / limit) } : null,
  });
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
      birthday: true,
      createdAt: true,
    },
  });
  if (!user) throw new AppError("User not found", 404);
  if (['leader', 'pastor'].includes(req.user.role?.toLowerCase()) && user.department !== req.user.department) {
    throw new AppError("User not found", 404);
  }
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateUserResponse'
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
  const { fullName, email, phone, department, role, password, birthday } = req.body;
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
      birthday: birthday ? parseBirthday(birthday) : null,
    },
  });
  return created(res, { userId: user.id }, "User created successfully");
}));

// Bulk import stewards from CSV
/**
 * @swagger
 * /users/import:
 *   post:
 *     summary: Bulk import stewards from CSV
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Import report
 *       400:
 *         description: Invalid CSV or file too large
 */
router.post('/import', authenticate, isAdmin, uploadCsv, asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('CSV file is required (field name: "file")', 400)
    const { validRows, failures } = parseCsvUsers(req.file.buffer.toString('utf8'))

    const emails = validRows.map(row => row.email)
    const existing = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { email: true },
    })
    const existingSet = new Set(existing.map(user => user.email.toLowerCase()))

    const toCreate = []
    for (const row of validRows) {
        if (existingSet.has(row.email)) {
            failures.push({ row: row.line, field: 'email', message: 'Email already registered' })
        } else {
            toCreate.push(row)
        }
    }

    let imported = 0
    if (toCreate.length > 0) {
        const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10)
        await prisma.$transaction(toCreate.map(row => prisma.user.create({
            data: {
                fullName: row.fullName,
                email: row.email,
                phone: row.phone,
                department: row.department,
                role: 'steward',
                birthday: row.birthday,
                password: hashedPassword,
            },
        })))
        imported = toCreate.length
    }

    return success(res, {
        imported,
        skipped: failures.length,
        defaultPassword: DEFAULT_PASSWORD,
        failures,
    }, 'CSV import completed')
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
  const { fullName, email, phone, department, role, birthday } = req.body;
  const existingUser = await prisma.user.findUnique({
    where: { id },
  });
  if (!existingUser) throw new AppError("User not found", 404);
  const birthdayValue =
    birthday === undefined ? existingUser.birthday : birthday ? parseBirthday(birthday) : null;
  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      fullName: fullName || existingUser.fullName,
      email: email || existingUser.email,
      phone: phone || existingUser.phone,
      department: department || existingUser.department,
      role: role || existingUser.role,
      birthday: birthdayValue,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      department: true,
      phone: true,
      birthday: true,
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
