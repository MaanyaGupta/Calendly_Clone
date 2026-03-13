const { PrismaClient } = require('@prisma/client');
const { fromZonedTime, formatInTimeZone } = require('date-fns-tz');
const p = new PrismaClient();

async function main() {
  const date = '2026-03-13';
  const viewerTimeZone = 'Asia/Kolkata';
  
  // Get event type
  const eventType = await p.eventType.findUnique({
    where: { slug: 'e4' },
    include: {
      user: {
        include: {
          availabilitySchedules: {
            where: { isDefault: true },
            include: { rules: true, dateOverrides: true },
          },
        },
      },
    },
  });
  
  const schedule = eventType.user.availabilitySchedules[0];
  const hostTimeZone = schedule.timezone;
  console.log('Host TZ:', hostTimeZone);
  console.log('Duration:', eventType.duration);
  
  const dayStart = fromZonedTime(`${date}T00:00:00.000`, viewerTimeZone);
  const dayEnd = fromZonedTime(`${date}T23:59:59.999`, viewerTimeZone);
  console.log('Viewer day start:', dayStart.toISOString());
  console.log('Viewer day end:', dayEnd.toISOString());
  
  const hostDates = new Set([
    formatInTimeZone(dayStart, hostTimeZone, 'yyyy-MM-dd'),
    formatInTimeZone(dayEnd, hostTimeZone, 'yyyy-MM-dd'),
  ]);
  console.log('Host dates:', [...hostDates]);
  
  for (const hostDate of hostDates) {
    console.log('\n--- Processing host date:', hostDate, '---');
    
    const override = schedule.dateOverrides.find((o) => {
      const overrideDate = new Date(o.date);
      const overrideDateStr = overrideDate.toISOString().split('T')[0];
      console.log('  Checking override:', overrideDateStr, 'vs', hostDate, overrideDateStr === hostDate);
      return overrideDateStr === hostDate;
    });
    
    if (override) {
      console.log('  Override found:', override.startTime, '-', override.endTime, 'unavailable:', override.isUnavailable);
      if (override.isUnavailable) {
        console.log('  SKIPPING: override is unavailable');
        continue;
      }
      
      const [startH, startM] = override.startTime.split(':').map(Number);
      const [endH, endM] = override.endTime.split(':').map(Number);
      let currentMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      const duration = eventType.duration;
      
      console.log('  Slot range:', currentMinutes, 'to', endMinutes, 'duration:', duration);
      console.log('  While condition:', currentMinutes + duration, '<=', endMinutes, '=', currentMinutes + duration <= endMinutes);
      
      while (currentMinutes + duration <= endMinutes) {
        const slotStartH = Math.floor(currentMinutes / 60);
        const slotStartM = currentMinutes % 60;
        const slotEndMinutes = currentMinutes + duration;
        const slotEndH = Math.floor(slotEndMinutes / 60);
        const slotEndM = slotEndMinutes % 60;
        
        const timeStr = `${hostDate}T${String(slotStartH).padStart(2, '0')}:${String(slotStartM).padStart(2, '0')}:00`;
        const slotStart = fromZonedTime(timeStr, hostTimeZone);
        const slotEnd = fromZonedTime(
          `${hostDate}T${String(slotEndH).padStart(2, '0')}:${String(slotEndM).padStart(2, '0')}:00`,
          hostTimeZone
        );
        
        console.log('  Slot:', timeStr, '-> UTC:', slotStart.toISOString());
        console.log('    In range?', slotStart >= dayStart && slotStart <= dayEnd);
        console.log('    isPast?', slotStart < new Date(), '(now:', new Date().toISOString(), ')');
        
        currentMinutes += duration;
      }
    } else {
      console.log('  No override, checking rules...');
    }
  }
  
  await p.$disconnect();
}

main().catch(console.error);
