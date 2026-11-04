/**
 * Draw Management Routes
 * - Schedule, run, publish draws
 * - Prize calculation engine
 */

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { authenticate, requireAdmin, auditLog } from '../middleware/auth'
import { settleDraw, scheduleDraw } from '../services/drawSettlement'

const createDrawSchema = z.object({
  gameId: z.string(),
  drawNumber: z.number().int().positive(),
  scheduledAt: z.string().datetime(),
  jackpotAmount: z.number().positive(),
})

const runDrawSchema = z.object({
  winningNumbers: z.array(z.number().int().positive()),
  supplementary: z.array(z.number().int().positive()).optional(),
  powerball: z.number().int().positive().optional(),
})

export default async function drawRoutes(app: FastifyInstance) {

  // GET /draws - Upcoming and recent draws (public)
  app.get('/', async (request, reply) => {
    const { gameId, status, page = '1', limit = '20' } = request.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const where: any = {}
    if (gameId) where.gameId = gameId
    if (status) where.status = status
    else where.status = { in: ['SCHEDULED', 'COMPLETED'] }

    const orderBy: any = status === 'COMPLETED' ? { drawnAt: 'desc' } : { scheduledAt: 'desc' }

    const [draws, total] = await Promise.all([
      prisma.draw.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy,
        include: {
          game: { select: { name: true, slug: true, imageUrl: true } },
        },
      }),
      prisma.draw.count({ where }),
    ])

    return reply.send({
      success: true,
      data: draws,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    })
  })

  // GET /draws/:id - Single draw details
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const draw = await prisma.draw.findUnique({
      where: { id },
      include: {
        game: {
          include: { prizeDivisions: { orderBy: { divisionOrder: 'asc' } } },
        },
        winningEntries: {
          select: { divisionName: true, prizeAmount: true, id: true },
        },
      },
    })

    if (!draw) return reply.status(404).send({ success: false, error: 'Draw not found' })

    return reply.send({ success: true, data: draw })
  })

  // GET /draws/next/:gameSlug - Next upcoming draw for a game
  app.get('/next/:gameSlug', async (request, reply) => {
    const { gameSlug } = request.params as { gameSlug: string }

    const draw = await prisma.draw.findFirst({
      where: { game: { slug: gameSlug }, status: 'SCHEDULED' },
      orderBy: { scheduledAt: 'asc' },
      include: { game: { select: { name: true, ticketPrice: true } } },
    })

    return reply.send({ success: true, data: draw })
  })

  // ── Admin Draw Management ─────────────────────────────────────────────────

  // POST /draws - Create a new draw (admin only)
  app.post('/', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const body = createDrawSchema.parse(request.body)

    const draw = await scheduleDraw({ ...body, gameId: body.gameId!, drawNumber: body.drawNumber!,
      scheduledAt: new Date(body.scheduledAt), jackpotAmount: body.jackpotAmount! })

    await auditLog(request.user.userId, 'DRAW_CREATED', 'Draw', draw.id, undefined, body, request)

    return reply.status(201).send({ success: true, data: draw })
  })

  // POST /draws/:id/run - Execute a draw (generate winning numbers)
  app.post('/:id/run', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = runDrawSchema.parse(request.body)

    const result = await settleDraw(id, body as any)
    await auditLog(request.user.userId, 'DRAW_EXECUTED', 'Draw', id, undefined, result, request)
    return reply.send({ success: true, message: 'Draw settled; prizes credited automatically.', data: result })
  })

  // Retry is safe: settlement is serialized and uniquely recorded per draw.
  app.post('/:id/calculate-prizes', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await settleDraw(id)
    return reply.send({ success: true, message: 'Draw settlement complete', data: result })
  })

  // POST /draws/:id/publish - Publish draw results
  app.post('/:id/publish', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const draw = await prisma.draw.findUnique({ where: { id } })
    if (!draw) return reply.status(404).send({ success: false, error: 'Draw not found' })
    if (draw.status !== 'COMPLETED') {
      return reply.status(400).send({ success: false, error: 'Draw must be completed before publishing' })
    }

    await prisma.draw.update({
      where: { id },
      data: {
        publishedAt: new Date(),
        isVerified: true,
        verifiedById: request.user.userId,
      },
    })

    await auditLog(request.user.userId, 'DRAW_PUBLISHED', 'Draw', id, undefined, undefined, request)

    return reply.send({ success: true, message: 'Draw results published' })
  })

  // PUT /draws/:id - Update draw (admin)
  app.put('/:id', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { scheduledAt, jackpotAmount, notes } = request.body as any

    const draw = await prisma.draw.update({
      where: { id },
      data: {
        ...(scheduledAt && { scheduledAt: new Date(scheduledAt) }),
        ...(jackpotAmount && { jackpotAmount }),
        ...(notes && { notes }),
      },
    })

    return reply.send({ success: true, data: draw })
  })

  // DELETE /draws/:id - Cancel draw (admin)
  app.delete('/:id', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const draw = await prisma.draw.findUnique({ where: { id } })
    if (!draw) return reply.status(404).send({ success: false, error: 'Draw not found' })
    if (draw.status !== 'SCHEDULED') {
      return reply.status(400).send({ success: false, error: 'Only scheduled draws can be cancelled' })
    }

    await prisma.draw.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    await auditLog(request.user.userId, 'DRAW_CANCELLED', 'Draw', id, undefined, undefined, request)

    return reply.send({ success: true, message: 'Draw cancelled' })
  })
}
