# Steward Attendance System — API

![Node.js](https://img.shields.io/badge/Node.js-v22-green)
![License](https://img.shields.io/badge/license-MIT-blue)

Backend API for the Steward Attendance System — tracks steward attendance at church meetings with role-based access control, excuse workflows, and automated absence marking.

## Tech Stack

- **Runtime**: Node.js v22
- **Framework**: Express 5
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Auth**: JWT access tokens + refresh tokens
- **Rate Limiting**: express-rate-limit
- **Validation**: express-validator
- **Scheduling**: node-cron
- **Docs**: Swagger (OpenAPI)

## Features

- JWT authentication with refresh token rotation
- Role-based authorization (admin, pastor, leader, steward)
- Attendance marking with auto-late detection (marks as late if after meeting cutoff)
- Excuse request submission, approval, and rejection
- Automated absence marking via cron job (mark unmarked stewards absent after cutoff)
- Refresh token cleanup cron job
- Full CRUD for meetings, users/stewards
- Swagger API documentation
- CORS configuration for multiple origins
- Graceful shutdown handling

## Getting Started

```bash
# Install dependencies
npm install

# Configure environment (see below)
# Run database migrations
npx prisma migrate dev

# Seed the first admin user
node seed.js

# Start the server
npm start
```

## Environment Variables

```env
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/stewarddb
JWT_SECRET=your_jwt_secret
CORS_ORIGINS=http://localhost:5173,https://your-frontend.vercel.app
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
| `NODE_ENV` | No | `production` or `development` |

## API Endpoints

### Authentication

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/auth/login` | Public | Login with email + password |
| POST | `/auth/refresh` | Public | Refresh expired access token |
| GET | `/auth/me` | Auth | Get current user profile |
| POST | `/auth/logout` | Public | Invalidate refresh token |

### Users / Stewards

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/users` | Auth | List all users |
| GET | `/users/search/:query` | Auth | Search by name, department, role, or phone |
| GET | `/users/:id` | Auth | Get single user |
| GET | `/users/:id/attendance` | Auth | User attendance history |
| POST | `/users` | Admin | Create new user |
| PATCH | `/users/:id` | Admin | Update user |
| DELETE | `/users/:id` | Admin | Delete user |

### Meetings

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/meetings` | Auth | List all meetings |
| GET | `/meetings/:id` | Auth | Get single meeting |
| POST | `/meetings` | Admin | Create meeting |
| PATCH | `/meetings/:id` | Admin | Update meeting |
| DELETE | `/meetings/:id` | Admin | Delete meeting |

### Attendance

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/attendance` | Admin/Pastor | Mark user present/absent |
| GET | `/attendance/meeting/:id` | Auth | Get meeting attendance list |
| GET | `/attendance/user/:id` | Auth | Get user attendance report |
| POST | `/attendance/finalize/:id` | Admin | Finalize a meeting |
| POST | `/attendance/excuse` | Auth (Steward) | Submit an excuse request |
| GET | `/attendance/excuse/pending` | Admin/Leader/Pastor | List pending excuses |
| PATCH | `/attendance/excuse/:id` | Admin/Leader/Pastor | Approve or reject an excuse |
| GET | `/attendance/my` | Auth | Current user's attendance history |
| GET | `/attendance/excuse/my` | Auth | Current user's excuse requests |

### Documentation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api-docs` | Swagger UI |
| GET | `/api-docs.json` | OpenAPI spec |

## Project Structure

```
steward-api/
├── cron/
│   ├── autoAbsent.js        # Auto-mark unmarked stewards absent
│   └── cleanupTokens.js     # Expired refresh token cleanup
├── middleware/
│   ├── authenticate.js      # JWT verification
│   ├── isAdmin.js           # Admin role guard
│   ├── isAuthorized.js      # Multi-role guard
│   ├── errorHandler.js      # Global error handler
│   ├── notFound.js          # 404 handler
│   └── validate.js          # Validation error handler
├── prisma/
│   └── schema.prisma        # Database schema
├── routes/
│   ├── auth.js              # Auth endpoints
│   ├── users.js             # User CRUD endpoints
│   ├── meetings.js          # Meeting CRUD endpoints
│   └── attendance.js        # Attendance endpoints
├── utils/
│   ├── asyncHandler.js      # Async error wrapper
│   ├── AppError.js          # Custom error class
│   └── response.js          # Response helpers
├── seed.js                  # Admin seed script
├── swagger.js               # Swagger/OpenAPI config
└── app.js                   # Express app entry point
```

## Cron Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| `autoAbsent` | Every 5 minutes | Marks unmarked stewards as absent for meetings past their end time |
| `cleanupTokens` | Every 6 hours | Deletes expired refresh tokens from the database |

## Live Demo

Base URL: `https://steward-api-production.up.railway.app`

Test login:

```bash
curl https://steward-api-production.up.railway.app/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@steward.com","password":"admin123"}'
```

## License

MIT
