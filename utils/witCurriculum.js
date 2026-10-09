// RCCG DC Workers-in-Training School 2026 — standard curriculum.
// Full program: 9 weeks, 18 sessions. `requiredForRefresher` marks the 7 sessions
// that the condensed refresher path sits (per the printed schedule).
const MORNING = { startTime: '7:10 AM', endTime: '8:10 AM' }
const SECOND = { startTime: '11:30 AM', endTime: '12:45 PM' }

const WIT_CURRICULUM = [
  { weekNumber: 1, ...MORNING, title: 'Brief History of RCCG / Vision & Mission Statement', teacher: 'Bro. Dami' },
  { weekNumber: 1, ...SECOND, title: 'Description of a Worker / Qualifications of a Worker', teacher: 'PMA' },
  { weekNumber: 2, ...MORNING, title: 'The Discovery Centre Steward: Expectations & Requirements', teacher: 'Bro. Dami', requiredForRefresher: true },
  { weekNumber: 2, ...SECOND, title: 'Service & Church Administration', teacher: 'Pst. Emeka', requiredForRefresher: true },
  { weekNumber: 3, ...MORNING, title: 'The Bible', teacher: 'Bro. Dami', requiredForRefresher: true },
  { weekNumber: 3, ...SECOND, title: 'Connect to Your Source: About God', teacher: 'Bro. Dami' },
  { weekNumber: 4, ...MORNING, title: 'Who Are You? About Man', teacher: 'Bro. Dami' },
  { weekNumber: 4, ...SECOND, title: 'Personal Change Management: Understanding the New Birth 1', teacher: 'Pst. Akomolafe' },
  { weekNumber: 5, ...MORNING, title: 'Personal Change Management: Understanding the New Birth 2', teacher: 'Pst. Akomolafe' },
  { weekNumber: 5, ...SECOND, title: 'Your Gifts, Call & Ministry', teacher: 'Bro. Dami', requiredForRefresher: true },
  { weekNumber: 6, ...MORNING, title: 'Get Empowered: Types of Baptisms', teacher: 'Pst. A. Y. Owoeye' },
  { weekNumber: 6, ...SECOND, title: 'Spiritual Appointment & Promotion / Divine Endowment', teacher: 'Bro. Dami', requiredForRefresher: true },
  { weekNumber: 7, ...MORNING, title: 'Reading & Meditation: Quiet Time', teacher: 'Bro. Muyiwa', requiredForRefresher: true },
  { weekNumber: 7, ...SECOND, title: 'Character Development: Christian Conduct & Discipline', teacher: 'Bro. Muyiwa' },
  { weekNumber: 8, ...MORNING, title: 'Kingdom Lifestyle: The Church of God, Personal Evangelism & Resurrection', teacher: 'Bro. Dami', requiredForRefresher: true },
  { weekNumber: 8, ...SECOND, title: 'Money Matters / Morality: Tithe & Offering', teacher: 'Pst. Owoeye' },
  { weekNumber: 9, ...MORNING, title: 'Success Habits: Saved to Serve', teacher: 'Bro. Dami' },
  { weekNumber: 9, ...SECOND, title: 'The Ministry of Reconciliation / Brokenness in Christian Life', teacher: 'Bro. Dami' },
]

module.exports = { WIT_CURRICULUM }
