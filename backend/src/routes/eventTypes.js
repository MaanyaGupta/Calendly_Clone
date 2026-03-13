const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// GET /api/event-types - List all event types
router.get('/', async (req, res, next) => {
  try {
    const eventTypes = await prisma.eventType.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });
    res.json(eventTypes);
  } catch (error) {
    next(error);
  }
});

// GET /api/event-types/:id - Get single event type
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const eventType = await prisma.eventType.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });
    if (!eventType) {
      return res.status(404).json({ error: 'Event type not found' });
    }
    res.json(eventType);
  } catch (error) {
    next(error);
  }
});

// GET /api/event-types/slug/:slug - Get event type by slug (public)
router.get('/slug/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const eventType = await prisma.eventType.findUnique({
      where: { slug },
      include: {
        user: {
          select: { name: true, email: true, timezone: true },
        },
      },
    });
    if (!eventType) {
      return res.status(404).json({ error: 'Event type not found' });
    }
    res.json(eventType);
  } catch (error) {
    next(error);
  }
});

// POST /api/event-types - Create event type
router.post('/', async (req, res, next) => {
  try {
    const { name, slug, duration, description, color, bufferBefore, bufferAfter, customQuestions } = req.body;

    // Get default user
    const user = await prisma.user.findFirst();
    if (!user) {
      return res.status(500).json({ error: 'No default user found' });
    }

    const eventType = await prisma.eventType.create({
      data: {
        userId: user.id,
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        duration: parseInt(duration),
        description: description || '',
        color: color || '#0069ff',
        bufferBefore: bufferBefore !== undefined && bufferBefore !== '' ? parseInt(bufferBefore) : 15,
        bufferAfter: bufferAfter !== undefined && bufferAfter !== '' ? parseInt(bufferAfter) : 15,
        customQuestions: customQuestions || [],
      },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });
    res.status(201).json(eventType);
  } catch (error) {
    next(error);
  }
});

// PUT /api/event-types/:id - Update event type
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, slug, duration, description, color, isActive, bufferBefore, bufferAfter, customQuestions } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (duration !== undefined) updateData.duration = parseInt(duration);
    if (description !== undefined) updateData.description = description;
    if (color !== undefined) updateData.color = color;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (bufferBefore !== undefined) updateData.bufferBefore = parseInt(bufferBefore);
    if (bufferAfter !== undefined) updateData.bufferAfter = parseInt(bufferAfter);
    if (customQuestions !== undefined) updateData.customQuestions = customQuestions;

    const eventType = await prisma.eventType.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });
    res.json(eventType);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/event-types/:id - Delete event type
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const eventTypeId = parseInt(id);
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
    });

    if (!eventType) {
      return res.status(404).json({ error: 'Event type not found' });
    }

    await prisma.$transaction([
      prisma.meeting.updateMany({
        where: { eventTypeId },
        data: {
          eventTypeName: eventType.name,
          eventTypeDuration: eventType.duration,
          eventTypeColor: eventType.color,
        },
      }),
      prisma.eventType.delete({
        where: { id: eventTypeId },
      }),
    ]);

    res.json({ message: 'Event type deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/event-types/:id/toggle - Toggle active state
router.patch('/:id/toggle', async (req, res, next) => {
  try {
    const { id } = req.params;
    const eventType = await prisma.eventType.findUnique({
      where: { id: parseInt(id) },
    });
    if (!eventType) {
      return res.status(404).json({ error: 'Event type not found' });
    }

    const updated = await prisma.eventType.update({
      where: { id: parseInt(id) },
      data: { isActive: !eventType.isActive },
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
