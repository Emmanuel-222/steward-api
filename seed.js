require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')
const { DEFAULT_PASSWORD } = require('./utils/constants')

const prisma = new PrismaClient()

async function main() {
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10)

    // 1. Create/Update Admin
    const admin = await prisma.user.upsert({
        where: { email: 'admin@steward.com' },
        update: { role: 'admin' },
        create: {
            fullName: 'System Admin',
            email: 'admin@steward.com',
            phone: '08000000000',
            department: 'Admin',
            role: 'admin',
            password: hashedPassword
        }
    })
    console.log('✅ Admin verified:', admin.email)

    console.log('\n🌟 Seeding complete! You can now log in with admin@steward.com /', DEFAULT_PASSWORD)
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
