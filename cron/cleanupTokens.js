const cron = require('node-cron')
const { prisma } = require('../prisma')

const cleanupExpiredTokens = () => {
    cron.schedule('0 0 * * *', async () => {
        console.log('[Cron] Cleaning up expired/revoked refresh tokens...')
        try {
            const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            const result = await prisma.refreshToken.deleteMany({
                where: {
                    OR: [
                        { expiresAt: { lt: new Date() } },
                        { revoked: true, createdAt: { lt: cutoff } }
                    ]
                }
            })
            console.log(`[Cron] Deleted ${result.count} expired/revoked refresh tokens`)
        } catch (error) {
            console.error('[Cron] Error cleaning up tokens:', error)
        }
    })
}

module.exports = cleanupExpiredTokens
