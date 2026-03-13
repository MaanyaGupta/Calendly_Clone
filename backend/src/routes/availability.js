const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// GET /api/availability - Get all schedules with rules
router.get('/', async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst();
    const schedules = await prisma.availabilitySchedule.findMany({
      where: { userId: user.id },
      include: {
        rules: { orderBy: { dayOfWeek: 'asc' } },
        dateOverrides: { orderBy: { date: 'asc' } },
      },
    });
    res.json(schedules);
  } catch (error) {
    next(error);
  }
});

// PUT /api/availability/:id - Update schedule rules
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, timezone, rules } = req.body;

    // Update schedule name/timezone if provided
    if (name || timezone) {
      await prisma.availabilitySchedule.update({
        where: { id: parseInt(id) },
        data: {
          ...(name && { name }),
          ...(timezone && { timezone }),
        },
      });
    }

    // Replace all rules if provided
    if (rules && Array.isArray(rules)) {
      await prisma.availabilityRule.deleteMany({
        where: { scheduleId: parseInt(id) },
      });

      await prisma.availabilityRule.createMany({
        data: rules.map((rule) => ({
          scheduleId: parseInt(id),
          dayOfWeek: rule.dayOfWeek,
          startTime: rule.startTime,
          endTime: rule.endTime,
          isAvailable: rule.isAvailable !== undefined ? rule.isAvailable : true,
        })),
      });
    }

    const updated = await prisma.availabilitySchedule.findUnique({
      where: { id: parseInt(id) },
      include: {
        rules: { orderBy: { dayOfWeek: 'asc' } },
        dateOverrides: { orderBy: { date: 'asc' } },
      },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// POST /api/availability/overrides - Add date override
router.post('/overrides', async (req, res, next) => {
  try {
    const { scheduleId, date, startTime, endTime, isUnavailable } = req.body;
    const override = await prisma.dateOverride.create({
      data: {
        scheduleId: parseInt(scheduleId),
        date: new Date(date),
        startTime: startTime || null,
        endTime: endTime || null,
        isUnavailable: isUnavailable || false,
      },
    });
    res.status(201).json(override);
  } catch (error) {
    next(error);
  }
});

// PUT /api/availability/overrides/:id - Update date override
router.put('/overrides/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { date, startTime, endTime, isUnavailable } = req.body;

    const override = await prisma.dateOverride.update({
      where: { id: parseInt(id) },
      data: {
        ...(date && { date: new Date(date) }),
        startTime: isUnavailable ? null : (startTime || null),
        endTime: isUnavailable ? null : (endTime || null),
        isUnavailable: Boolean(isUnavailable),
      },
    });

    res.json(override);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/availability/overrides/:id - Delete date override
router.delete('/overrides/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.dateOverride.delete({
      where: { id: parseInt(id) },
    });
    res.json({ message: 'Override deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
