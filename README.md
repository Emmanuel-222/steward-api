# Steward Attendance System 
![Node.js](https://img.shields.io/badge/Node.js-v22-green)
![License](https://img.shields.io/badge/license-MIT-blue)

# Description
  This is the steward attendance system for keeping record of steward in church of how often they attend meetings, when they attend the meetings and how much of the time they were also absent.

# Features
1. Admin can sign in 
2. Admin can create user, update user, delete user and get specific user.
3. Admin can 
view all users, search users, and filter by attendance status
4. Admins can mark stewards present or absent at meetings
5. System tracks attendance records with timestamps
6. Reporting features to view attendance statistics and patterns

# Tech Stack
- **Runtime**: Node.js v22
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcrypt
- **Scheduling**: node-cron

# Installation
1. Clone the repository
2. Install dependencies: `npm install`
3. Configure environment variables (see below)
4. Run database migrations: `npx prisma migrate dev`
5. Seed the first admin: `node seed.js`
6. Start the server: `nodemon app.js`

# Environment Variables
```
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/stewarddb
JWT_SECRET=your_jwt_secret
```

## Live Demo
Base URL: `https://steward-api-production.up.railway.app`

Test the API:
```bash
curl https://steward-api-production.up.railway.app/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@steward.com","password":"admin123"}'
```

# API Endpoints
### Auth
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | /auth/login | Public | Admin login |

### Users
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | /users | Admin | Get all users |
| GET | /users/:id | Admin | Get single user |
| GET | /users/search?name= | Admin | Search user by name |
| POST | /users | Admin | Create new user |
| PATCH | /users/:id | Admin | Update user |
| DELETE | /users/:id | Admin | Delete user |
| GET | /users/:id/attendance | Admin | User attendance history |

### Meetings
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | /meetings | Auth | Get all meetings |
| GET | /meetings/:id | Auth | Get single meeting |
| POST | /meetings | Admin | Create meeting |
| PATCH | /meetings/:id | Admin | Update meeting |
| DELETE | /meetings/:id | Admin | Delete meeting |

### Attendance
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | /attendance | Admin | Mark user present |
| GET | /attendance/meeting/:id | Auth | Get meeting attendance |
| GET | /attendance/user/:id | Auth | Get user attendance report |

# Project Structure
```
steward-api/
├── cron/
│   └── autoAbsent.js
├── middleware/
│   ├── authenticate.js
│   └── isAdmin.js
├── prisma/
│   └── schema.prisma
├── routes/
│   ├── auth.js
│   ├── users.js
│   ├── meetings.js
│   └── attendance.js
├── seed.js
├── app.js
└── .env
```

# What I Learned
- How to design a relational database schema from scratch — 
  finding the nouns, properties and relationships before writing any code
- The difference between authentication (who are you?) and 
  authorisation (what are you allowed to do?)
- How cron jobs work — building a scheduler that automatically 
  marks stewards absent after the meeting cutoff time
- Why `select` matters in Prisma — never return a password field, 
  even when hashed
- How `include` fetches related table data automatically without writing SQL joins

# License
MIT