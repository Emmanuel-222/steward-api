const cron = require('node-cron')
const { prisma } = require('../prisma')

const autoMarkAbsent = async () => {
    // Helper to parse "11:20 AM" or "14:05" into a Date object for today
    const parseTime = (dateBase, timeStr) => {
        if (!timeStr || typeof timeStr !== 'string') return null;
        
        const trimmedTime = timeStr.trim();
        const match12 = trimmedTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
        const match24 = trimmedTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        
        let hours, minutes;

        if (match12) {
            let [_, h, m, modifier] = match12;
            hours = parseInt(h, 10);
            minutes = parseInt(m, 10);
            if (modifier.toUpperCase() === 'PM' && hours < 12) hours += 12;
            if (modifier.toUpperCase() === 'AM' && hours === 12) hours = 0;
        } else if (match24) {
            let [_, h, m] = match24;
            hours = parseInt(h, 10);
            minutes = parseInt(m, 10);
        } else {
            return null;
        }

        const date = new Date(dateBase);
        date.setHours(hours, minutes, 0, 0);
        return date;
    };

    // Run every minute
    cron.schedule('* * * * *', async () => {
        const now = new Date();
        console.log(`[Cron] Checking for expired cutoffs at ${now.toLocaleTimeString()}`);

        // Define today's range (local time)
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);

        try {
            // Find all meetings scheduled for today
            const meetings = await prisma.meeting.findMany({
                where: {
                    date: {
                        gte: todayStart,
                        lt: tomorrowStart
                    }
                }
            });

            if (meetings.length === 0) {
                console.log('[Cron] No meetings found for today');
                return;
            }

            for (const meeting of meetings) {
                const endDateTime = parseTime(meeting.date, meeting.endTime);
                
                if (!endDateTime) {
                    console.error(`[Cron] Could not parse endTime "${meeting.endTime}" for meeting ID ${meeting.id}`);
                    continue;
                }

                // Check if we have passed the end time
                if (now < endDateTime) {
                    console.log(`[Cron] Meeting "${meeting.type}" (ID: ${meeting.id}) end time (${meeting.endTime}) not yet reached.`);
                    continue;
                }

                console.log(`[Cron] Processing absences for meeting: ${meeting.type} (ID: ${meeting.id}) after end time.`);

                // Get all users who should be tracked (non-admins)
                const targetUsers = await prisma.user.findMany({
                    where: {
                        OR: [
                            { role: { equals: 'steward', mode: 'insensitive' } },
                            { role: { equals: 'pastor', mode: 'insensitive' } },
                            { role: { equals: 'leader', mode: 'insensitive' } }
                        ]
                    }
                });

                console.log(`[Cron] Found ${targetUsers.length} target users to check.`);
                if (targetUsers.length > 0) {
                    console.log(`[Cron] Target users: ${targetUsers.map(u => `${u.email} (${u.role})`).join(', ')}`);
                }

                // Get existing attendance for this meeting
                const markedAttendance = await prisma.attendance.findMany({
                    where: { meetingId: meeting.id },
                    select: { userId: true }
                });
                
                const markedUserIds = markedAttendance.map(a => a.userId);

                // Filter for users not yet marked
                const unmarkedUsers = targetUsers.filter(user => !markedUserIds.includes(user.id));

                if (unmarkedUsers.length === 0) {
                    console.log(`[Cron] All ${targetUsers.length} target users already accounted for in meeting ${meeting.id}`);
                    continue;
                }

                // Mark them absent
                const absentRecords = unmarkedUsers.map(user => ({
                    userId: user.id,
                    meetingId: meeting.id,
                    status: 'absent',
                    markedAt: new Date()
                }));

                await prisma.attendance.createMany({
                    data: absentRecords
                });

                console.log(`[Cron] Successfully marked ${absentRecords.length} users as absent for meeting ${meeting.id}`);
            }
        } catch (error) {
            console.error('[Cron] Error in autoMarkAbsent:', error);
        }
    });
};

module.exports = autoMarkAbsent