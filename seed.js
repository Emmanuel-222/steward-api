require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')

const prisma = new PrismaClient()

async function main() {
    const hashedPassword = await bcrypt.hash('admin123', 10)
    
    // 1. Create/Update Admin
    const admin = await prisma.user.upsert({
        where: { email: 'admin@steward.com' },
        update: {},
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

    // 2. Create some Stewards for testing Rush Mode
    const stewardsData = [
        { name: 'John Steward', email: 'john@church.com', role: 'steward' },
        { name: 'Sarah Leader', email: 'sarah@church.com', role: 'leader' },
        { name: 'Pastor Mike', email: 'mike@church.com', role: 'pastor' },
        { name: 'Abigail Chen', email: 'abigail@church.com', role: 'steward' },
        { name: 'David Smith', email: 'david@church.com', role: 'steward' },
        { name: 'Emma Wilson', email: 'emma@church.com', role: 'steward' },
    ]

    console.log('⏳ Seeding stewards...')
    for (const s of stewardsData) {
        await prisma.user.upsert({
            where: { email: s.email },
            update: {},
            create: {
                fullName: s.name,
                email: s.email,
                phone: '09012345678',
                department: 'Service',
                role: s.role,
                password: hashedPassword // same password for all test users
            }
        })
    }

    // 3. Create an active meeting for TODAY
    const today = new Date()
    const meeting = await prisma.meeting.create({
        data: {
            title: 'Sunday Morning Service',
            type: 'Sunday',
            date: today,
            startTime: '08:00 AM',
            cutoffTime: '08:30 AM',
            endTime: '11:00 AM',
            location: 'Main Sanctuary',
            status: 'Ongoing'
        }
    })
    console.log('🚀 Active meeting created:', meeting.title)

    console.log('\n🌟 Seeding complete! You can now log in with admin@steward.com / admin123')
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())