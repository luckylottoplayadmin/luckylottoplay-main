/**
 * Lottery Games Routes
 * - Game listings, details, draws, prize divisions
 * - Ticket purchase flow
 */

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma, redis } from '../server'
import { authenticate, requireAdmin } from '../middleware/auth'
import { processAffiliateCommission } from '../services/affiliate'
import crypto from 'crypto'
import { assertDrawOpen, SALES_CLOSE_MS } from '../services/drawEligibility'

const purchaseSchema = z.object({
  gameId: z.string(),
  drawId: z.string().optional(),
  lines: z.array(z.object({
    numbers: z.array(z.number().int().positive()),
    supplementary: z.array(z.number().int().positive()).optional(),
    powerball: z.number().int().positive().optional(),
  })).min(1).max(1000),
  isQuickPick: z.boolean().default(false),
  draws: z.literal(1).default(1),
  isSyndicate: z.boolean().default(false),
  syndicateId: z.string().optional(),
})

export default async function gameRoutes(app: FastifyInstance) {

  // GET /games - List all active games
  app.get('/', async (request, reply) => {
    const cacheKey = 'games:all'
    const cached = await redis.get(cacheKey)
    if (cached) {
      return reply.send({ success: true, data: JSON.parse(cached) })
    }

    const games = await prisma.game.findMany({
      where: { isActive: true },
      orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }],
      include: {
        jackpotPool: true,
        prizeDivisions: { orderBy: { divisionOrder: 'asc' } },
        draws: {
          where: { status: 'SCHEDULED' },
          orderBy: { scheduledAt: 'asc' },
          take: 1,
          select: {
            id: true,
            drawNumber: true,
            scheduledAt: true,
            jackpotAmount: true,
          },
        },
      },
    })

    const enriched = games.map((g) => ({
      ...g,
      nextDraw: g.draws[0] || null,
    }))

    await redis.setex(cacheKey, 60, JSON.stringify(enriched)) // 1min cache
    return reply.send({ success: true, data: enriched })
  })

  // GET /games/:slug - Single game details
  app.get('/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }

    const game = await prisma.game.findUnique({
      where: { slug },
      include: {
        jackpotPool: true,
        prizeDivisions: { orderBy: { divisionOrder: 'asc' } },
        draws: {
          where: { status: { in: ['SCHEDULED', 'COMPLETED'] } },
          orderBy: { scheduledAt: 'desc' },
          take: 10,
          select: {
            id: true,
            drawNumber: true,
            scheduledAt: true,
            drawnAt: true,
            jackpotAmount: true,
            status: true,
            winningNumbers: true,
            supplementary: true,
            powerball: true,
          },
        },
      },
    })

    if (!game) {
      return reply.status(404).send({ success: false, error: 'Game not found' })
    }

    return reply.send({ success: true, data: game })
  })

  // GET /games/:slug/results - Draw history with winning numbers
  app.get('/:slug/results', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const { page = '1', limit = '20' } = request.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const game = await prisma.game.findUnique({ where: { slug }, select: { id: true } })
    if (!game) return reply.status(404).send({ success: false, error: 'Game not found' })

    const [draws, total] = await Promise.all([
      prisma.draw.findMany({
        where: { gameId: game.id, status: 'COMPLETED' },
        orderBy: { scheduledAt: 'desc' },
        skip,
        take: Number(limit),
        select: {
          id: true,
          drawNumber: true,
          drawnAt: true,
          jackpotAmount: true,
          winningNumbers: true,
          supplementary: true,
          powerball: true,
          totalSales: true,
          totalPrizes: true,
          winningEntries: {
            select: {
              divisionName: true,
              prizeAmount: true,
            },
          },
        },
      }),
      prisma.draw.count({ where: { gameId: game.id, status: 'COMPLETED' } }),
    ])

    return reply.send({
      success: true,
      data: draws,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    })
  })

  // GET /games/:slug/jackpot - Current jackpot
  app.get('/:slug/jackpot', async (request, reply) => {
    const { slug } = request.params as { slug: string }

    const game = await prisma.game.findUnique({
      where: { slug },
      select: { jackpotAmount: true, name: true },
    })

    if (!game) return reply.status(404).send({ success: false, error: 'Game not found' })

    const nextDraw = await prisma.draw.findFirst({
      where: { game: { slug }, status: 'SCHEDULED' },
      orderBy: { scheduledAt: 'asc' },
    })

    return reply.send({
      success: true,
      data: {
        jackpot: game.jackpotAmount,
        gameName: game.name,
        nextDraw,
      },
    })
  })

  // POST /games/purchase - Purchase lottery tickets
  app.post('/purchase', {
    preHandler: authenticate,
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = purchaseSchema.parse(request.body)
    const userId = request.user.userId

    // Get game and validate
    const game = await prisma.game.findUnique({
      where: { id: body.gameId, isActive: true },
    })

    if (!game) {
      return reply.status(404).send({ success: false, error: 'Game not found or unavailable' })
    }

    // Validate numbers for each line
    for (const line of body.lines) {
      if (line.numbers.length !== game.minNumbers) {
        return reply.status(400).send({
          success: false,
          error: `Each line must have exactly ${game.minNumbers} numbers`,
        })
      }

      const uniqueNums = new Set(line.numbers)
      if (uniqueNums.size !== line.numbers.length) {
        return reply.status(400).send({ success: false, error: 'Duplicate numbers not allowed' })
      }

      if (line.numbers.some((n) => n < 1 || n > game.numberPool)) {
        return reply.status(400).send({
          success: false,
          error: `Numbers must be between 1 and ${game.numberPool}`,
        })
      }

      if (game.hasPowerball && (!line.powerball || line.powerball > game.powerballPool)) {
        return reply.status(400).send({ success: false, error: 'Powerball number required' })
      }
    }

    // Get next scheduled draw
    const draw = body.drawId
      ? await prisma.draw.findUnique({ where: { id: body.drawId } })
      : await prisma.draw.findFirst({
          where: { gameId: game.id, status: 'SCHEDULED', scheduledAt: { gt: new Date(Date.now() + SALES_CLOSE_MS) } },
          orderBy: { scheduledAt: 'asc' },
        })

    if (!draw) {
      return reply.status(400).send({ success: false, error: 'No upcoming draw available' })
    }

    // MED-02 FIX: Do NOT check balance outside the transaction (TOCTOU race).
    // Two concurrent requests could both pass a pre-transaction balance check
    // using the same stale value. Instead we lock the wallet row inside the
    // transaction with a raw SELECT FOR UPDATE, matching the pattern used in
    // wallet.ts for withdrawals and transfers.
    // The wallets_balance_nonneg CHECK constraint is a last-resort safety net,
    // but we want a clean 400 error, not a raw constraint-violation 500.

    const totalCost = Number(game.ticketPrice) * body.lines.length * body.draws

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (!wallet) {
      return reply.status(400).send({
        success: false,
        error: 'Wallet not found. Please contact support.',
        code: 'WALLET_NOT_FOUND',
      })
    }

    // Generate unique ticket number
    const ticketNumber = generateTicketNumber()
    const qrData = `MegaDraw:${ticketNumber}:${game.slug}:${draw.drawNumber}`

    // Create ticket in transaction — balance check + deduction is atomic
    let ticket: any
    try {
      ticket = await prisma.$transaction(async (tx) => {
        // The settlement engine takes this same row lock. No purchase can
        // commit into a draw after settlement has acquired ownership.
        await tx.$queryRaw`SELECT id FROM draws WHERE id = ${draw.id} FOR UPDATE`
        // MED-02: Lock the wallet row so no concurrent transaction can read the
        // same balance and both pass the insufficient-funds check.
        const [lockedWallet] = await tx.$queryRaw<Array<{ id: string; balance: any; bonusBalance: any }>>`
          SELECT id, balance, "bonusBalance"
          FROM wallets
          WHERE id = ${wallet.id}
          FOR UPDATE
        `

        // Re-read after both locks; a request may have waited past sales close.
        const currentDraw = await tx.draw.findUnique({ where: { id: draw.id } })
        assertDrawOpen(currentDraw, game.id, new Date())
        const balance      = Number(lockedWallet.balance)
        const bonusBalance = Number(lockedWallet.bonusBalance ?? 0)

        if (balance + bonusBalance < totalCost) {
          throw Object.assign(
            new Error('Insufficient funds. Please deposit to continue.'),
            { code: 'INSUFFICIENT_FUNDS' }
          )
        }

        // Deduct from wallet (use bonus first)
        const bonusUsed = Math.min(bonusBalance, totalCost)
        const mainUsed  = totalCost - bonusUsed

        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance:      { decrement: mainUsed },
            bonusBalance: { decrement: bonusUsed },
            totalSpent:   { increment: totalCost },
          },
        })

      // Create ticket
      const newTicket = await tx.ticket.create({
        data: {
          userId,
          gameId: game.id,
          drawId: draw.id,
          ticketNumber,
          qrCode: qrData,
          isQuickPick: body.isQuickPick,
          isSyndicate: body.isSyndicate,
          syndicateId: body.syndicateId,
          draws: body.draws,
          totalCost,
          numbers: {
            create: body.lines.map((line, idx) => ({
              lineIndex: idx,
              numbers: line.numbers,
              supplementary: line.supplementary,
              powerball: line.powerball,
            })),
          },
        },
        include: { numbers: true },
      })

      // Log transaction
      await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'TICKET_PURCHASE',
          status: 'COMPLETED',
          amount: -totalCost,
          balanceBefore: balance + bonusBalance,
          balanceAfter: (balance + bonusBalance) - totalCost,
          reference: `TKT-${ticketNumber}`,
          description: `${game.name} ticket - Draw #${draw.drawNumber}`,
          ticketId: newTicket.id,
          drawId: draw.id,
        },
      })

      // Update draw sales
      await tx.draw.update({
        where: { id: draw.id },
        data: { totalSales: { increment: totalCost } },
      })

      return newTicket
      }) // end $transaction
    } catch (err: any) {
      if (err?.code === 'INSUFFICIENT_FUNDS' || err?.code === 'DRAW_CLOSED') {
        return reply.status(400).send({
          success: false,
          error: err.message,
          code: err.code,
        })
      }
      // Re-throw unexpected errors (Prisma constraint violations etc.)
      throw err
    }

    // Send confirmation notification
    await prisma.notification.create({
      data: {
        userId,
        title: 'Ticket purchased',
        message: `Your ${game.name} ticket #${ticketNumber} for Draw #${draw.drawNumber} has been purchased.`,
        data: { ticketId: ticket.id, gameSlug: game.slug },
      },
    })

    // Process affiliate commission for ticket purchase
    processAffiliateCommission({ referredUserId: userId, type: 'TICKET_PURCHASE', amount: totalCost }).catch(console.error)

    return reply.status(201).send({
      success: true,
      message: 'Ticket purchased successfully',
      data: {
        ticket: {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          gameName: game.name,
          drawNumber: draw.drawNumber,
          drawDate: draw.scheduledAt,
          totalCost,
          lines: ticket.numbers,
          qrCode: ticket.qrCode,
        },
      },
    })
  })

  // POST /games/quick-pick - Generate quick pick numbers
  app.post('/quick-pick', async (request, reply) => {
    const { gameId, lines = 1 } = request.body as { gameId: string; lines?: number }

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { numberPool: true, minNumbers: true, hasPowerball: true, powerballPool: true },
    })

    if (!game) return reply.status(404).send({ success: false, error: 'Game not found' })

    const picks = Array.from({ length: Math.min(lines, 1000) }, () => {
      const nums = shuffleArray(
        Array.from({ length: game.numberPool }, (_, i) => i + 1)
      ).slice(0, game.minNumbers).sort((a, b) => a - b)

      const result: any = { numbers: nums }

      if (game.hasPowerball && game.powerballPool) {
        result.powerball = crypto.randomInt(1, game.powerballPool + 1)
      }

      return result
    })

    return reply.send({ success: true, data: picks })
  })
}

function generateTicketNumber(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 12 }, () => chars[crypto.randomInt(0, chars.length)]).join('')
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
