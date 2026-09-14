require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')
const { DEFAULT_PASSWORD } = require('./utils/constants')

const prisma = new PrismaClient()

async function main() {
  console.log('Wiping all tables...')
  await prisma.$executeRaw`DELETE FROM "VerificationCode"`
  await prisma.$executeRaw`DELETE FROM "RefreshToken"`
  await prisma.$executeRaw`DELETE FROM "Attendance"`
  await prisma.$executeRaw`DELETE FROM "ExcuseRequest"`
  await prisma.$executeRaw`DELETE FROM "Meeting"`
  await prisma.$executeRaw`DELETE FROM "User"`
  console.log('All tables wiped.')

  console.log('Re-seeding admin...')
  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@steward.com' },
    update: { role: 'admin', password: hashedPassword, mustChangePassword: true },
    create: {
      fullName: 'System Admin',
      email: 'admin@steward.com',
      phone: '08000000000',
      department: 'Admin',
      role: 'admin',
      password: hashedPassword,
      mustChangePassword: true,
    }
  })
  console.log('Admin created:', admin.email)
  console.log('\nLogin with: admin@steward.com /', DEFAULT_PASSWORD)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
