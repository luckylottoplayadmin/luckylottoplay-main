/**
 * Ticket Routes
 * - View purchased tickets, check status, validate, claim prizes
 */

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { authenticate, auditLog } from '../middleware/auth'

const claimSchema = z.object({
  ticketId: z.string(),
})

export default async function ticketRoutes(app: FastifyInstance) {

  // GET /tickets - User's ticket history
  app.get('/', { preHandler: authenticate }, async (request, reply) => {
    const {
      page = '1',
      limit = '20',
      status,
      gameId,
    } = request.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const where: any = { userId: request.user.userId }
    if (status) where.status = status
    if (gameId) where.gameId = gameId

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { purchasedAt: 'desc' },
        include: {
          game: { select: { name: true, slug: true, imageUrl: true } },
          draw: {
            select: {
              drawNumber: true,
              scheduledAt: true,
              drawnAt: true,
              status: true,
              winningNumbers: true,
              supplementary: true,
              powerball: true,
            },
          },
          numbers: true,
        },
      }),
      prisma.ticket.count({ where }),
    ])

    return reply.send({
      success: true,
      data: tickets,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    })
  })

  // GET /tickets/:id - Single ticket details
  app.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const ticket = await prisma.ticket.findFirst({
      where: { id, userId: request.user.userId },
      include: {
        game: {
          select: {
            name: true,
            slug: true,
            imageUrl: true,
            ticketPrice: true,
            hasSupplementary: true,
            hasPowerball: true,
          },
        },
        draw: {
          select: {
            drawNumber: true,
            scheduledAt: true,
            drawnAt: true,
            status: true,
            winningNumbers: true,
            supplementary: true,
            powerball: true,
          },
        },
        numbers: { orderBy: { lineIndex: 'asc' } },
        winningEntries: {
          select: {
            divisionName: true,
            prizeAmount: true,
            isPaid: true,
            paidAt: true,
          },
        },
      },
    })

    if (!ticket) {
      return reply.status(404).send({ success: false, error: 'Ticket not found' })
    }

    return reply.send({ success: true, data: ticket })
  })

  // POST /tickets/:id/check - Check ticket against draw results
  app.post('/:id/check', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const ticket = await prisma.ticket.findFirst({
      where: { id, userId: request.user.userId },
      include: {
        draw: true,
        numbers: true,
        winningEntries: true,
        game: { select: { name: true } },
      },
    })

    if (!ticket) {
      return reply.status(404).send({ success: false, error: 'Ticket not found' })
    }

    if (!ticket.draw || ticket.draw.status !== 'COMPLETED') {
      return reply.send({
        success: true,
        data: { checked: false, message: 'Draw has not completed yet' },
      })
    }

    const winningNums = ticket.draw.winningNumbers as number[]
    const suppNums = ticket.draw.supplementary as number[] | null

    // Check each line
    const results = ticket.numbers.map((line) => {
      const nums = line.numbers as number[]
      const matched = nums.filter((n) => winningNums.includes(n))
      const matchedSupp = suppNums
        ? nums.filter((n) => suppNums.includes(n))
        : []
      const pbMatched =
        ticket.draw?.powerball && line.powerball === ticket.draw.powerball

      return {
        lineIndex: line.lineIndex,
        numbers: nums,
        matched: matched.length,
        matchedNumbers: matched,
        matchedSupp: matchedSupp.length,
        powerballMatched: pbMatched || false,
      }
    })

    // Update ticket status if not already checked
    if (ticket.status === 'ACTIVE') {
      const hasWin = ticket.winningEntries && ticket.winningEntries.length > 0
      await prisma.ticket.update({
        where: { id },
        data: { status: hasWin ? 'WON' : 'LOST' },
      })
    }

    return reply.send({
      success: true,
      data: {
        ticketNumber: ticket.ticketNumber,
        gameName: ticket.game.name,
        drawNumber: ticket.draw.drawNumber,
        winningNumbers: winningNums,
        supplementary: suppNums,
        powerball: ticket.draw.powerball,
        lineResults: results,
        prizeAmount: ticket.prizeAmount,
        prizeDivision: ticket.prizeDivision,
        status: ticket.status,
      },
    })
  })

  // Payouts are automatic. Legacy clients must never trigger another credit,
  // including for old entries whose historical isPaid flag was incorrect.
  app.post('/:id/claim', { preHandler: authenticate }, async (_request, reply) => {
    return reply.status(410).send({ success: false, code: 'AUTOMATIC_PRIZE_SETTLEMENT',
      error: 'Prizes are credited automatically when the draw is settled. Contact support for a historical payout review.' })
  })

  // GET /tickets/validate/:ticketNumber - Validate ticket by number
  app.get('/validate/:ticketNumber', async (request, reply) => {
    const { ticketNumber } = request.params as { ticketNumber: string }

    const ticket = await prisma.ticket.findUnique({
      where: { ticketNumber },
      include: {
        game: { select: { name: true, slug: true } },
        draw: {
          select: {
            drawNumber: true,
            scheduledAt: true,
            status: true,
            winningNumbers: true,
          },
        },
      },
    })

    if (!ticket) {
      return reply.status(404).send({ success: false, error: 'Ticket not found' })
    }

    return reply.send({
      success: true,
      data: {
        ticketNumber: ticket.ticketNumber,
        gameName: ticket.game.name,
        drawNumber: ticket.draw?.drawNumber,
        drawDate: ticket.draw?.scheduledAt,
        status: ticket.status,
        purchasedAt: ticket.purchasedAt,
        totalCost: ticket.totalCost,
        prizeAmount: ticket.prizeAmount,
        prizeDivision: ticket.prizeDivision,
      },
    })
  })
}
