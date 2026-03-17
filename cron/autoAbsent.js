const cron = require('node-cron')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const autoMarkAbsent = async () => {
    // create schedule 
    cron.schedule('* * * * *', async () => {
        console.log('running every minute of every hour, every day of the month')

        // Create the 24 hour interval 
        const today = new Date()  //get the present date
        today.setHours(0, 0, 0, 0)  //set the hour of the day to 12:00 am starting of that day
        const tomorrow = new Date(today)  // set tomorrow to today, then
        tomorrow.setDate(tomorrow.getDate() + 1)  // make the date one day ahead of today but on the same hour.

        const meeting = await prisma.meeting.findFirst({
            where: {
                date: { gte: today, lt: tomorrow },  //chck for date greater or equal to today var and less than tomorrow which make 24 hours, you get.
                type: 'Sunday'
            },
            orderBy: { createdAt: 'desc' }
        })

        if (!meeting) {
            console.log('No Sunday meeting found for today')
            return
        }
        const meetingCutOffTime = new Date(meeting.cutoffTime)
        console.log(meetingCutOffTime)

        // get all users that should attend -- which include all role except the admin
        const allUsers = await prisma.user.findMany({
            where: {
                role: { in: ['steward', 'pastor', 'leader'] }
            }
        })

        // get all users who have been marked present or absent
        const markedAttendance = await prisma.attendance.findMany({
            where: { meetingId: meeting.id }
        })
        const markedUserId = markedAttendance.map(attendance => attendance.userId)  //we do this because only users id showing on the attendance for this particular meeting is here.

        const unmarkedUsers = allUsers.filter(user => !markedUserId.includes(user.id))  //put in a new array 'unmarkedUsers' all user's id not included in the array holding all user's id marked prsent or absent.

        if (unmarkedUsers.length === 0) {
            console.log('All users already marked for this meeting')
            return
        }

        // create a record matching our attendance schema, but with absent users
        const absentRecords = unmarkedUsers.map((user) => ({
            userId: user.id,
            meetingId: meeting.id,
            status: 'absent',
            markedAt: new Date()
        }))

        await prisma.attendance.createMany({
            data: absentRecords
        })
    })
}

module.exports = autoMarkAbsent