const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { fromZonedTime, formatInTimeZone } = require('date-fns-tz');
const router = express.Router();
const prisma = new PrismaClient();

const WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function normalizeGuestEmails(guests) {
  if (typeof guests !== 'string') {
    return null;
  }

  const guestEmails = guests
    .split(',')
    .map((guest) => guest.trim())
    .filter(Boolean);

  return guestEmails.length > 0 ? guestEmails.join(', ') : null;
}

// GET /api/booking/:slug/availability?month=YYYY-MM - Get bookable dates for a month
router.get('/:slug/availability', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { month, timezone } = req.query;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Month query parameter is required (YYYY-MM)' });
    }

    const { eventType, schedule, hostTimeZone } = await getBookingContext(slug);
    const viewerTimeZone = isValidTimeZone(timezone) ? timezone : hostTimeZone;
    const { dates, firstDate, lastDate } = getMonthDateStrings(month);
    const { dayStart: monthStart } = getDayBounds(firstDate, viewerTimeZone);
    const { dayEnd: monthEnd } = getDayBounds(lastDate, viewerTimeZone);
    const existingMeetings = await getExistingMeetings(monthStart, monthEnd);
    const now = new Date();

    const availableDates = dates.filter((date) => (
      buildAvailableSlots({
        eventType,
        schedule,
        date,
        viewerTimeZone,
        hostTimeZone,
        existingMeetings,
        now,
      }).length > 0
    ));

    res.json(availableDates);
  } catch (error) {
    next(error);
  }
});

// GET /api/booking/:slug/slots?date=YYYY-MM-DD - Get available slots
router.get('/:slug/slots', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { date, timezone } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Date query parameter is required (YYYY-MM-DD)' });
    }

    const { eventType, schedule, hostTimeZone } = await getBookingContext(slug);
    const viewerTimeZone = isValidTimeZone(timezone) ? timezone : hostTimeZone;
    const { dayStart: viewerDayStart, dayEnd: viewerDayEnd } = getDayBounds(date, viewerTimeZone);
    const existingMeetings = await getExistingMeetings(viewerDayStart, viewerDayEnd);
    const slots = buildAvailableSlots({
      eventType,
      schedule,
      date,
      viewerTimeZone,
      hostTimeZone,
      existingMeetings,
      now: new Date(),
    });

    res.json(slots);
  } catch (error) {
    next(error);
  }
});

// POST /api/booking/:slug - Book a slot
router.post('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const {
      inviteeName,
      inviteeEmail,
      startTime,
      endTime,
      inviteeTimezone,
      guests,
      customAnswers,
    } = req.body;

    if (!inviteeName || !inviteeEmail || !startTime || !endTime) {
      return res.status(400).json({
        error: 'inviteeName, inviteeEmail, startTime, and endTime are required',
      });
    }

    // Get event type
    const eventType = await prisma.eventType.findUnique({
      where: { slug },
    });

    if (!eventType) {
      return res.status(404).json({ error: 'Event type not found' });
    }

    // Check for double booking
    const slotStart = new Date(startTime);
    const slotEnd = new Date(endTime);

    const conflict = await prisma.meeting.findFirst({
      where: {
        status: 'scheduled',
        OR: [
          {
            startTime: { lt: slotEnd },
            endTime: { gt: slotStart },
          },
        ],
      },
    });

    if (conflict) {
      return res.status(409).json({ error: 'This time slot is already booked' });
    }

    const meeting = await prisma.meeting.create({
      data: {
        eventTypeId: eventType.id,
        eventTypeName: eventType.name,
        eventTypeDuration: eventType.duration,
        eventTypeColor: eventType.color,
        inviteeName,
        inviteeEmail,
        guestEmails: normalizeGuestEmails(guests),
        inviteeTimezone: isValidTimeZone(inviteeTimezone) ? inviteeTimezone : 'UTC',
        startTime: slotStart,
        endTime: slotEnd,
        customAnswers: customAnswers || {},
      },
      include: {
        eventType: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
      },
    });

    res.status(201).json(meeting);
  } catch (error) {
    next(error);
  }
});

function isValidTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') {
    return false;
  }

  try {
    Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function getDayBounds(date, timeZone) {
  return {
    dayStart: fromZonedTime(`${date}T00:00:00.000`, timeZone),
    dayEnd: fromZonedTime(`${date}T23:59:59.999`, timeZone),
  };
}

function getDayOfWeek(date, timeZone) {
  const zonedNoon = fromZonedTime(`${date}T12:00:00.000`, timeZone);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(zonedNoon);

  return WEEKDAY_INDEX[weekday];
}

async function getBookingContext(slug) {
  const eventType = await prisma.eventType.findUnique({
    where: { slug },
    include: {
      user: {
        include: {
          availabilitySchedules: {
            where: { isDefault: true },
            include: {
              rules: true,
              dateOverrides: true,
            },
          },
        },
      },
    },
  });

  if (!eventType) {
    const error = new Error('Event type not found');
    error.status = 404;
    throw error;
  }

  if (!eventType.isActive) {
    const error = new Error('This event type is currently inactive');
    error.status = 400;
    throw error;
  }

  const schedule = eventType.user.availabilitySchedules[0];
  if (!schedule) {
    return {
      eventType,
      schedule: null,
      hostTimeZone: eventType.user.timezone || 'UTC',
    };
  }

  return {
    eventType,
    schedule,
    hostTimeZone: schedule.timezone || eventType.user.timezone || 'UTC',
  };
}

async function getExistingMeetings(rangeStart, rangeEnd) {
  return prisma.meeting.findMany({
    where: {
      status: 'scheduled',
      startTime: { lt: rangeEnd },
      endTime: { gt: rangeStart },
    },
  });
}

function getMonthDateStrings(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const dates = [];

  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(`${month}-${String(day).padStart(2, '0')}`);
  }

  return {
    dates,
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
  };
}

function buildAvailableSlots({
  eventType,
  schedule,
  date,
  viewerTimeZone,
  hostTimeZone,
  existingMeetings,
  now,
}) {
  if (!schedule) {
    return [];
  }

  const { dayStart: viewerDayStart, dayEnd: viewerDayEnd } = getDayBounds(date, viewerTimeZone);
  const hostDates = new Set([
    formatInTimeZone(viewerDayStart, hostTimeZone, 'yyyy-MM-dd'),
    formatInTimeZone(viewerDayEnd, hostTimeZone, 'yyyy-MM-dd'),
  ]);
  const slots = [];
  const slotMap = new Map();
  const duration = eventType.duration;
  const bufferBefore = eventType.bufferBefore || 15;
  const bufferAfter = eventType.bufferAfter || 15;

  for (const hostDate of hostDates) {
    const override = schedule.dateOverrides.find((o) => {
      const overrideDate = new Date(o.date);
      return overrideDate.toISOString().split('T')[0] === hostDate;
    });

    let startTime;
    let endTime;

    if (override) {
      if (override.isUnavailable) {
        continue;
      }
      startTime = override.startTime;
      endTime = override.endTime;
    } else {
      const dayOfWeek = getDayOfWeek(hostDate, hostTimeZone);
      const rule = schedule.rules.find(
        (r) => r.dayOfWeek === dayOfWeek && r.isAvailable
      );
      if (!rule) {
        continue;
      }
      startTime = rule.startTime;
      endTime = rule.endTime;
    }

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    let currentMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    while (currentMinutes + duration <= endMinutes) {
      const slotStartH = Math.floor(currentMinutes / 60);
      const slotStartM = currentMinutes % 60;
      const slotEndMinutes = currentMinutes + duration;
      const slotEndH = Math.floor(slotEndMinutes / 60);
      const slotEndM = slotEndMinutes % 60;

      const slotStart = fromZonedTime(
        `${hostDate}T${String(slotStartH).padStart(2, '0')}:${String(slotStartM).padStart(2, '0')}:00`,
        hostTimeZone
      );
      const slotEnd = fromZonedTime(
        `${hostDate}T${String(slotEndH).padStart(2, '0')}:${String(slotEndM).padStart(2, '0')}:00`,
        hostTimeZone
      );

      if (slotStart < viewerDayStart || slotStart > viewerDayEnd) {
        currentMinutes += duration;
        continue;
      }

      const bufferStart = new Date(slotStart.getTime() - bufferBefore * 60000);
      const bufferEnd = new Date(slotEnd.getTime() + bufferAfter * 60000);

      const isConflict = existingMeetings.some((meeting) => {
        const meetingStart = new Date(meeting.startTime);
        const meetingEnd = new Date(meeting.endTime);
        return bufferStart < meetingEnd && bufferEnd > meetingStart;
      });

      const isPast = slotStart < now;

      if (!isConflict && !isPast) {
        slotMap.set(slotStart.toISOString(), {
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
          display: formatInTimeZone(slotStart, viewerTimeZone, 'h:mm a'),
        });
      }

      currentMinutes += duration;
    }
  }

  slots.push(...slotMap.values());
  slots.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  return slots;
}

module.exports = router;
