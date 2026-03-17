require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')

const prisma = new PrismaClient()

async function main() {
    const hashedPassword = await bcrypt.hash('admin123', 10)
    const admin = await prisma.user.create({
        data: {
            fullName: 'System Admin',
            email: 'admin@steward.com',
            phone: '08000000000',
            department: 'Admin',
            role: 'admin',
            password: hashedPassword
        }
    })
    console.log('Admin created:', admin)
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())