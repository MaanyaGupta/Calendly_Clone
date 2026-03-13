const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.meeting.deleteMany();
  await prisma.dateOverride.deleteMany();
  await prisma.availabilityRule.deleteMany();
  await prisma.availabilitySchedule.deleteMany();
  await prisma.eventType.deleteMany();
  await prisma.user.deleteMany();

  // Create default user
  const user = await prisma.user.create({
    data: {
      name: 'Maanya Gupta',
      email: 'maanya@example.com',
      timezone: 'Asia/Kolkata',
    },
  });

  console.log('Created user:', user.name);

  // Create availability schedule
  const schedule = await prisma.availabilitySchedule.create({
    data: {
      userId: user.id,
      name: 'Working Hours',
      timezone: 'Asia/Kolkata',
      isDefault: true,
    },
  });

  // Create availability rules (Mon-Fri 9AM-5PM, Sat-Sun 9AM-5PM)
  const days = [
    { dayOfWeek: 0, startTime: '09:00', endTime: '17:00', isAvailable: true },  // Sun
    { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isAvailable: true },  // Mon
    { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', isAvailable: true },  // Tue
    { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', isAvailable: true },  // Wed
    { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', isAvailable: true },  // Thu
    { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', isAvailable: true },  // Fri
    { dayOfWeek: 6, startTime: '09:00', endTime: '17:00', isAvailable: true },  // Sat
  ];

  for (const day of days) {
    await prisma.availabilityRule.create({
      data: {
        scheduleId: schedule.id,
        ...day,
      },
    });
  }

  console.log('Created availability schedule with rules');

  // Create event types
  const eventTypes = await Promise.all([
    prisma.eventType.create({
      data: {
        userId: user.id,
        name: 'New Meeting',
        slug: 'new-meeting',
        duration: 30,
        description: 'In-person meeting · One-on-One',
        color: '#6c3cf0',
        isActive: true,
      },
    }),
    prisma.eventType.create({
      data: {
        userId: user.id,
        name: '30 Minute Meeting',
        slug: '30-minute-meeting',
        duration: 30,
        description: 'Google Meet · One-on-One',
        color: '#0069ff',
        isActive: true,
      },
    }),
    prisma.eventType.create({
      data: {
        userId: user.id,
        name: 'Quick Chat',
        slug: 'quick-chat',
        duration: 15,
        description: 'A brief 15-minute catch-up call',
        color: '#ff6b00',
        isActive: true,
      },
    }),
  ]);

  console.log('Created event types:', eventTypes.map(e => e.name).join(', '));

  // Create sample meetings
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const dayAfter = new Date(now);
  dayAfter.setDate(dayAfter.getDate() + 2);
  dayAfter.setHours(14, 0, 0, 0);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(11, 0, 0, 0);

  await Promise.all([
    prisma.meeting.create({
      data: {
        eventTypeId: eventTypes[0].id,
        inviteeName: 'John Doe',
        inviteeEmail: 'john@example.com',
        startTime: tomorrow,
        endTime: new Date(tomorrow.getTime() + 30 * 60000),
        status: 'scheduled',
      },
    }),
    prisma.meeting.create({
      data: {
        eventTypeId: eventTypes[1].id,
        inviteeName: 'Jane Smith',
        inviteeEmail: 'jane@example.com',
        startTime: dayAfter,
        endTime: new Date(dayAfter.getTime() + 30 * 60000),
        status: 'scheduled',
      },
    }),
    prisma.meeting.create({
      data: {
        eventTypeId: eventTypes[2].id,
        inviteeName: 'Bob Wilson',
        inviteeEmail: 'bob@example.com',
        startTime: yesterday,
        endTime: new Date(yesterday.getTime() + 15 * 60000),
        status: 'scheduled',
      },
    }),
  ]);

  console.log('Created sample meetings');
  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
