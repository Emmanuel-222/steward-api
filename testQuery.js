const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const targetUsers = await prisma.user.findMany({
        where: {
            role: { in: ['steward', 'pastor', 'leader', 'Steward', 'Pastor', 'Leader'] }
        }
    });
    console.log("Target users found by the query used in autoAbsent.js:");
    console.log(targetUsers.map(u => ({ id: u.id, email: u.email, role: u.role })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
