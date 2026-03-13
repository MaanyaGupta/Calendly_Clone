const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const meetings = await p.meeting.findMany({ where: { status: 'scheduled' } });
  meetings.forEach(m => {
    console.log(m.id, m.startTime.toISOString(), '-', m.endTime.toISOString(), m.eventTypeName);
  });
  console.log('Total meetings:', meetings.length);
  await p.$disconnect();
}

main().catch(console.error);
