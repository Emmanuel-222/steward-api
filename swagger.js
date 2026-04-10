const swaggerJsdoc = require('swagger-jsdoc')

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Steward API',
            version: '1.0.0',
            description: 'API documentation for the Steward attendance and meeting management system.',
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Local development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        message: {
                            type: 'string',
                            example: 'Something went wrong',
                        },
                    },
                },
                LoginRequest: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: {
                            type: 'string',
                            example: 'admin@example.com',
                        },
                        password: {
                            type: 'string',
                            example: 'password123',
                        },
                    },
                },
                LoginResponse: {
                    type: 'object',
                    properties: {
                        message: {
                            type: 'string',
                            example: 'Login is successful',
                        },
                        token: {
                            type: 'string',
                            example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                        },
                    },
                },
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        fullName: { type: 'string', example: 'John Doe' },
                        email: { type: 'string', example: 'john@example.com' },
                        phone: { type: 'string', example: '08012345678' },
                        department: { type: 'string', example: 'Protocol' },
                        role: { type: 'string', example: 'admin' },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    },
                },
                CreateUserRequest: {
                    type: 'object',
                    required: ['fullName', 'email', 'phone', 'department', 'role', 'password'],
                    properties: {
                        fullName: { type: 'string', example: 'Jane Doe' },
                        email: { type: 'string', example: 'jane@example.com' },
                        phone: { type: 'string', example: '08098765432' },
                        department: { type: 'string', example: 'Choir' },
                        role: { type: 'string', example: 'steward' },
                        password: { type: 'string', example: 'securePass123' },
                    },
                },
                UpdateUserRequest: {
                    type: 'object',
                    properties: {
                        fullName: { type: 'string', example: 'Jane Smith' },
                        email: { type: 'string', example: 'janesmith@example.com' },
                        phone: { type: 'string', example: '08000000000' },
                        department: { type: 'string', example: 'Ushering' },
                        role: { type: 'string', example: 'leader' },
                    },
                },
                Meeting: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        type: { type: 'string', example: 'Sunday Service' },
                        date: { type: 'string', format: 'date-time' },
                        startTime: { type: 'string', example: '07:00 AM' },
                        cutoffTime: { type: 'string', example: '08:30 AM' },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    },
                },
                CreateMeetingRequest: {
                    type: 'object',
                    required: ['type', 'date', 'startTime', 'cutoffTime'],
                    properties: {
                        type: { type: 'string', example: 'Special Meeting' },
                        date: { type: 'string', format: 'date', example: '2026-03-25' },
                        startTime: { type: 'string', example: '06:00 PM' },
                        cutoffTime: { type: 'string', example: '06:30 PM' },
                    },
                },
                UpdateMeetingRequest: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', example: 'Workers Meeting' },
                        date: { type: 'string', format: 'date', example: '2026-03-28' },
                        startTime: { type: 'string', example: '05:00 PM' },
                        cutoffTime: { type: 'string', example: '05:30 PM' },
                    },
                },
                Attendance: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        status: { type: 'string', example: 'present' },
                        markedAt: { type: 'string', format: 'date-time' },
                        userId: { type: 'integer', example: 1 },
                        meetingId: { type: 'integer', example: 2 },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                MarkAttendanceRequest: {
                    type: 'object',
                    required: ['userId', 'meetingId'],
                    properties: {
                        userId: { type: 'integer', example: 1 },
                        meetingId: { type: 'integer', example: 2 },
                    },
                },
            },
        },
    },
    apis: ['./routes/*.js'],
}

module.exports = swaggerJsdoc(options)
