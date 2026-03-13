const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// GET /api/meetings?type=upcoming|past - List meetings
router.get('/', async (req, res, next) => {
  try {
    const { type } = req.query;
    const now = new Date();

    let where = {};
    if (type === 'upcoming') {
      where = {
        startTime: { gte: now },
        status: 'scheduled',
      };
    } else if (type === 'past') {
      where = {
        OR: [
          { startTime: { lt: now } },
          { status: 'cancelled' },
        ],
      };
    }

    const meetings = await prisma.meeting.findMany({
      where,
      orderBy: { startTime: type === 'past' ? 'desc' : 'asc' },
      include: {
        eventType: {
          select: {
            name: true,
            slug: true,
            duration: true,
            color: true,
          },
        },
      },
    });

    res.json(meetings);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/meetings/:id/cancel - Cancel a meeting
router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { cancelReason } = req.body;

    const meeting = await prisma.meeting.update({
      where: { id: parseInt(id) },
      data: {
        status: 'cancelled',
        cancelReason: cancelReason || null,
      },
      include: {
        eventType: {
          select: {
            name: true,
            slug: true,
            duration: true,
            color: true,
          },
        },
      },
    });

    res.json(meeting);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/meetings/:id/reschedule - Reschedule a meeting
router.patch('/:id/reschedule', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newStartTime, newEndTime } = req.body;

    if (!newStartTime || !newEndTime) {
      return res.status(400).json({ error: 'newStartTime and newEndTime are required' });
    }

    const meetingId = parseInt(id);
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    if (meeting.status !== 'scheduled') {
      return res.status(400).json({ error: 'Only scheduled meetings can be rescheduled' });
    }

    // 1. Prevent rescheduling past meetings
    if (new Date(meeting.startTime) < new Date()) {
      return res.status(400).json({ error: 'Cannot reschedule a meeting that has already passed' });
    }

    const newStart = new Date(newStartTime);
    const newEnd = new Date(newEndTime);

    // Prevent rescheduling to a past time
    if (newStart < new Date()) {
      return res.status(400).json({ error: 'Cannot reschedule to a time in the past' });
    }

    // 2. Prevent rescheduling to the same time
    if (
      newStart.getTime() === new Date(meeting.startTime).getTime() &&
      newEnd.getTime() === new Date(meeting.endTime).getTime()
    ) {
      return res.status(400).json({ error: 'New time is the same as the current time' });
    }

    // 3. Check for conflicts, excluding the current meeting
    const conflict = await prisma.meeting.findFirst({
      where: {
        id: { not: meetingId },
        status: 'scheduled',
        startTime: { lt: newEnd },
        endTime: { gt: newStart },
      },
    });

    if (conflict) {
      return res.status(409).json({ error: 'This time slot conflicts with another meeting' });
    }

    const updated = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        startTime: newStart,
        endTime: newEnd,
      },
      include: {
        eventType: {
          select: {
            name: true,
            slug: true,
            duration: true,
            color: true,
          },
        },
      },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
