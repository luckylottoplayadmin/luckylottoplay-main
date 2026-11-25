/**
 * Support Routes
 * - Ticket submission, messaging, FAQ
 */

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { authenticate, requireAdmin } from '../middleware/auth'
import { sensitiveRateLimit } from '../middleware/sensitiveRateLimit'

const createTicketSchema = z.object({
  subject: z.string().min(5).max(200),
  category: z.string(),
  message: z.string().min(10).max(5000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
})

const addMessageSchema = z.object({
  message: z.string().min(1).max(5000),
  isInternal: z.boolean().default(false),
})

export default async function supportRoutes(app: FastifyInstance) {

  // POST /support/contact - Public contact form submission
  app.post('/contact', {
    preHandler: [sensitiveRateLimit({ max: 5, timeWindowMs: 15 * 60 * 1000, keyPrefix: 'support:contact' })],
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const body = z.object({
      name: z.string().trim().min(2).max(100),
      email: z.string().email().max(200),
      subject: z.string().trim().min(3).max(200),
      message: z.string().trim().min(5).max(5000),
    }).parse(request.body)

    let categoryRecord = await prisma.ticketCategoryModel.findFirst({ where: { name: 'General Enquiries' } })
    if (!categoryRecord) {
      categoryRecord = await prisma.ticketCategoryModel.create({ data: { name: 'General Enquiries' } })
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        subject: `[Contact Form] ${body.subject}`,
        categoryId: categoryRecord.id,
        priority: 'MEDIUM',
        messages: {
          create: {
            senderId: 'GUEST',
            senderType: 'GUEST',
            message: `From: ${body.name} (${body.email})\n\n${body.message}`,
          },
        },
      },
    })

    return reply.status(201).send({
      success: true,
      message: 'Your message has been sent successfully. Our team will reply shortly.',
      data: { ticketId: ticket.id },
    })
  })

  // GET /support/faqs - Public FAQ list
  app.get('/faqs', async (request, reply) => {
    const { category } = request.query as { category?: string }

    const faqs = await prisma.fAQ.findMany({
      where: { isActive: true, ...(category && { category }) },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    })

    return reply.send({ success: true, data: faqs })
  })

  // GET /support/tickets - User's support tickets
  app.get('/tickets', { preHandler: authenticate }, async (request, reply) => {
    const { page = '1', limit = '10' } = request.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where: { userId: request.user.userId },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          messages: {
            where: { isInternal: false },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.supportTicket.count({ where: { userId: request.user.userId } }),
    ])

    return reply.send({
      success: true,
      data: tickets,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    })
  })

  // POST /support/tickets - Submit a support ticket
  app.post('/tickets', {
    preHandler: authenticate,
    config: { rateLimit: { max: 50, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const body = createTicketSchema.parse(request.body)
    const userId = request.user.userId

    const ticket = await prisma.$transaction(async (tx) => {
      // Find or create the category
      let categoryRecord = await tx.ticketCategoryModel.findUnique({ where: { name: body.category } });
      if (!categoryRecord) {
        categoryRecord = await tx.ticketCategoryModel.create({ data: { name: body.category } });
      }

      const t = await tx.supportTicket.create({
        data: {
          userId,
          subject: body.subject,
          categoryId: categoryRecord.id,
          priority: body.priority,
        },
      })

      await tx.supportMessage.create({
        data: {
          ticketId: t.id,
          senderId: userId,
          message: body.message,
        },
      })

      return t
    })

    return reply.status(201).send({
      success: true,
      message: 'Support ticket submitted',
      data: { ticketId: ticket.id },
    })
  })

  // GET /support/tickets/:id - Get ticket with messages
  app.get('/tickets/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id,
        ...(request.user.role !== 'ADMIN' && request.user.role !== 'SUPER_ADMIN' && request.user.role !== 'SUPPORT'
          ? { userId: request.user.userId }
          : {}),
      },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!ticket) {
      return reply.status(404).send({ success: false, error: 'Ticket not found' })
    }

    return reply.send({ success: true, data: ticket })
  })

  // POST /support/tickets/:id/messages - Add a message to ticket
  app.post('/tickets/:id/messages', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = addMessageSchema.parse(request.body)
    const userId = request.user.userId
    const isAdminUser = ['ADMIN', 'SUPER_ADMIN', 'SUPPORT'].includes(request.user.role)

    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id,
        ...(!isAdminUser && { userId }),
      },
    })

    if (!ticket) {
      return reply.status(404).send({ success: false, error: 'Ticket not found' })
    }

    if (ticket.status === 'CLOSED') {
      return reply.status(400).send({ success: false, error: 'Ticket is closed' })
    }

    const message = await prisma.supportMessage.create({
      data: {
        ticketId: id,
        senderId: userId,
        message: body.message,
        isInternal: isAdminUser && body.isInternal,
      },
    })

    // Update ticket status if admin replied
    if (isAdminUser && ticket.status === 'OPEN') {
      await prisma.supportTicket.update({
        where: { id },
        data: { status: 'IN_PROGRESS', assignedToId: userId },
      })

      // Notify user
      await prisma.notification.create({
        data: {
          userId: ticket.userId!,
          title: 'Support reply received',
          message: `Your support ticket "${ticket.subject}" has been updated.`,
          data: { ticketId: id },
        },
      })
    }

    return reply.status(201).send({ success: true, data: message })
  })

  // PATCH /support/tickets/:id/status - Update ticket status (admin)
  app.patch('/tickets/:id/status', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = z.object({
      status: z.enum(['OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED']),
    }).parse(request.body)

    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: {
        status: status as any,
        ...(status === 'RESOLVED' && { resolvedAt: new Date() }),
      },
    })

    return reply.send({ success: true, data: ticket })
  })

  // ── Admin Support Queue ─────────────────────────────────────────────────────

  app.get('/admin/queue', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const { page = '1', limit = '20', status } = request.query as Record<string, string>
    const limitNum = Math.min(Math.max(1, Number(limit) || 20), 100)
    const skip = (Math.max(1, Number(page) || 1) - 1) * limitNum

    const where: any = {}
    if (status) where.status = status
    else where.status = { in: ['OPEN', 'IN_PROGRESS'] }

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      prisma.supportTicket.count({ where }),
    ])

    return reply.send({
      success: true,
      data: tickets,
      pagination: { page: Math.max(1, Number(page) || 1), limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    })
  })

  // ── Admin FAQ Management ────────────────────────────────────────────────────

  app.post('/faqs', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { question, answer, category, sortOrder } = request.body as any

    const faq = await prisma.fAQ.create({
      data: { question, answer, category, sortOrder: sortOrder || 0 },
    })

    return reply.status(201).send({ success: true, data: faq })
  })

  app.put('/faqs/:id', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = request.body as any

    const faq = await prisma.fAQ.update({ where: { id }, data })
    return reply.send({ success: true, data: faq })
  })

  app.delete('/faqs/:id', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.fAQ.delete({ where: { id } })
    return reply.send({ success: true })
  })
}
