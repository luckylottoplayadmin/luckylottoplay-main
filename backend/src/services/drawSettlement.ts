import { Prisma } from '@prisma/client'
import { CronExpressionParser } from 'cron-parser'
import { randomInt } from 'crypto'
import { prisma } from '../server'
import { processDrawJackpot } from './jackpot.service'

export type DrawResult = { winningNumbers: number[]; supplementary?: number[]; powerball?: number | null }
const fail = (message: string, statusCode = 409): never => { throw Object.assign(new Error(message), { statusCode }) }

export function nextDrawDate(expression: string, currentDate: Date): Date {
  return CronExpressionParser.parse(expression, { currentDate, tz: 'UTC' }).next().toDate()
}

function pick(pool: number, count: number, excluded: number[] = []): number[] {
  if (!Number.isInteger(pool) || !Number.isInteger(count) || count < 0 || pool < count + excluded.length) {
    fail('Invalid game number configuration', 400)
  }
  const values = new Set<number>()
  while (values.size < count) {
    const value = randomInt(1, pool + 1)
    if (!excluded.includes(value)) values.add(value)
  }
  return [...values].sort((a, b) => a - b)
}

export function validateDrawResult(game: any, result: DrawResult): void {
  const valid = (values: number[], count: number, pool: number) => Array.isArray(values) &&
    values.length === count && new Set(values).size === count &&
    values.every(n => Number.isInteger(n) && n >= 1 && n <= pool)
  if (!valid(result.winningNumbers, game.minNumbers, game.numberPool)) fail('Invalid winning numbers', 400)
  const supp = result.supplementary || []
  if (game.hasSupplementary) {
    if (!valid(supp, game.suppNumbers || 0, game.suppPool || game.numberPool) ||
      supp.some(n => result.winningNumbers.includes(n))) fail('Invalid supplementary numbers', 400)
  } else if (supp.length) fail('This game does not use supplementary numbers', 400)
  if (game.hasPowerball) {
    if (!Number.isInteger(result.powerball) || result.powerball! < 1 || result.powerball! > game.powerballPool) {
      fail('Invalid powerball number', 400)
    }
  } else if (result.powerball != null) fail('This game does not use powerball', 400)
}

export function generateDrawResult(game: any): DrawResult {
  const winningNumbers = pick(game.numberPool, game.minNumbers)
  return {
    winningNumbers,
    supplementary: game.hasSupplementary
      ? pick(game.suppPool || game.numberPool, game.suppNumbers || 0, winningNumbers.filter(n => n <= (game.suppPool || game.numberPool))) : [],
    powerball: game.hasPowerball ? randomInt(1, game.powerballPool + 1) : null,
  }
}

// Preserve the platform's existing best-division-per-ticket rule. Jackpot wins
// take precedence even when their amount is calculated later from the pool.
export function evaluateTicket(ticket: any, divisions: any[], result: DrawResult): any | null {
  let best: any = null
  for (const line of ticket.numbers) {
    const matched = (line.numbers as number[]).filter(n => result.winningNumbers.includes(n)).length
    const matchedSupp = (line.numbers as number[]).filter(n => (result.supplementary || []).includes(n)).length
    for (const division of divisions) {
      if (division.matchNumbers !== matched || (division.matchSupp || 0) > matchedSupp ||
        (division.matchPB && line.powerball !== result.powerball)) continue
      if (!best || (division.isJackpot && !best.isJackpot) ||
        (!best.isJackpot && Number(division.fixedPrize || 0) > Number(best.fixedPrize || 0))) best = division
      break
    }
  }
  return best
}

/**
 * All draw entry points use this transaction. Game-row serialization protects
 * the jackpot and next-draw creation; the draw lock also serializes purchases.
 * A crash rolls back results and money together. IN_PROGRESS draws resume with
 * their stored numbers, never a newly generated result.
 */
export async function settleDraw(drawId: string, suppliedResult?: DrawResult) {
  const identity = await prisma.draw.findUnique({ where: { id: drawId }, select: { gameId: true } })
  if (!identity) fail('Draw not found', 404)
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM games WHERE id = ${identity.gameId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM draws WHERE id = ${drawId} FOR UPDATE`
    const draw = await tx.draw.findUnique({
      where: { id: drawId },
      include: { game: { include: { prizeDivisions: { orderBy: { divisionOrder: 'asc' } } } }, settlement: true },
    })
    if (!draw) fail('Draw not found', 404)
    if (draw.settlement) return { ...(draw.settlement.summary as any), alreadySettled: true }
    // Legacy completed draws must never be paid again.
    if (draw.status === 'COMPLETED') return { drawId, totalPrizes: Number(draw.totalPrizes), alreadySettled: true }
    if (!['SCHEDULED', 'IN_PROGRESS'].includes(draw.status)) fail('Draw cannot be settled in its current state')
    const now = new Date()
    if (draw.scheduledAt > now) fail('Draw has not reached its scheduled time')
    const stored = draw.status === 'IN_PROGRESS'
    if (stored && suppliedResult) fail('Results are already recorded; resume settlement without replacing them')
    const result: DrawResult = stored ? {
      winningNumbers: draw.winningNumbers as number[],
      supplementary: (draw.supplementary as number[]) || [], powerball: draw.powerball,
    } : suppliedResult || generateDrawResult(draw.game)
    validateDrawResult(draw.game, result)
    // Never recover a partially paid legacy draw automatically: it needs ledger
    // reconciliation, not a blind replay of old payout logic.
    const previousCredit = await tx.transaction.findFirst({ where: { drawId, type: 'PRIZE_CREDIT' }, select: { id: true } })
    const previousEntries = await tx.winningEntry.count({ where: { drawId } })
    if (previousCredit || previousEntries) fail('Draw has legacy payout records; manual reconciliation is required')

    await tx.draw.update({ where: { id: drawId }, data: {
      status: 'IN_PROGRESS', winningNumbers: result.winningNumbers,
      supplementary: result.supplementary || [], powerball: result.powerball ?? null, drawnAt: draw.drawnAt || now,
    } })
    const tickets = await tx.ticket.findMany({ where: { drawId, status: { not: 'CANCELLED' } },
      include: { numbers: true }, orderBy: [{ userId: 'asc' }, { id: 'asc' }] })
    const results = tickets.map(ticket => ({ ticket, division: evaluateTicket(ticket, draw.game.prizeDivisions, result) }))
    // Lock all wallets in a deterministic order before jackpot and fixed payouts.
    const userIds = [...new Set(tickets.map(t => t.userId))].sort()
    for (const userId of userIds) {
      const rows = await tx.$queryRaw<any[]>`SELECT id FROM wallets WHERE "userId" = ${userId} FOR UPDATE`
      if (!rows.length) fail('A ticket owner has no wallet; settlement was rolled back')
    }
    const jackpot = await processDrawJackpot(tx, draw.gameId, drawId, draw.drawNumber, Number(draw.totalSales),
      results.filter(r => r.division?.isJackpot).map(r => r.ticket.userId), draw.game.minJackpot)
    let totalPrizes = 0
    const winnersSummary: Record<string, number> = {}
    for (const { ticket, division } of results) {
      if (!division) {
        await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'LOST' } })
        continue
      }
      const prize = division.isJackpot ? jackpot.perWinnerAmount : Number(division.fixedPrize || 0)
      if (!division.isJackpot && prize > 0) {
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: ticket.userId } })
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: prize }, totalWon: { increment: prize } } })
        await tx.transaction.create({ data: {
          userId: ticket.userId, walletId: wallet.id, type: 'PRIZE_CREDIT', status: 'COMPLETED', amount: prize,
          balanceBefore: wallet.balance, balanceAfter: new Prisma.Decimal(wallet.balance).plus(prize),
          reference: `WIN-${drawId}-${ticket.id}`, description: `Winnings from Draw #${draw.drawNumber}`,
          drawId, ticketId: ticket.id,
        } })
      }
      await tx.winningEntry.create({ data: { ticketId: ticket.id, drawId, divisionName: division.divisionName,
        prizeAmount: prize, isPaid: true, paidAt: now } })
      await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'WON', prizeAmount: prize,
        prizeDivision: division.divisionName, claimedAt: now } })
      await tx.notification.create({ data: { userId: ticket.userId, title: 'Prize credited',
        message: `${prize.toFixed(2)} Coins credited for Draw #${draw.drawNumber}.`, data: { drawId, ticketId: ticket.id } } })
      totalPrizes += prize
      winnersSummary[division.divisionName] = (winnersSummary[division.divisionName] || 0) + 1
    }
    // Next-draw creation is part of settlement, so an invalid cron expression
    // rolls everything back instead of silently stopping future draws.
    if (draw.game.drawSchedule) {
      const next = await tx.draw.findFirst({ where: { gameId: draw.gameId, drawNumber: { gt: draw.drawNumber } } })
      if (!next) {
        const latest = await tx.draw.findFirst({ where: { gameId: draw.gameId }, orderBy: { drawNumber: 'desc' } })
        await tx.draw.create({ data: { gameId: draw.gameId, drawNumber: (latest?.drawNumber || draw.drawNumber) + 1,
          scheduledAt: nextDrawDate(draw.game.drawSchedule, now), jackpotAmount: jackpot.jackpotAfter, status: 'SCHEDULED' } })
      }
    }
    const summary = { drawId, totalPrizes, winnersSummary, jackpot }
    await tx.draw.update({ where: { id: drawId }, data: { status: 'COMPLETED', totalPrizes, isVerified: false } })
    await tx.drawSettlement.create({ data: { drawId, summary: summary as any } })
    return { ...summary, alreadySettled: false }
  }, { maxWait: 10_000, timeout: 60_000 })
}

// Administrative scheduling uses the same game lock as automatic scheduling.
export async function scheduleDraw(data: { gameId: string; drawNumber: number; scheduledAt: Date; jackpotAmount: number }) {
  if (!Number.isInteger(data.drawNumber) || data.drawNumber < 1 || !Number.isFinite(data.scheduledAt.getTime()) ||
      data.scheduledAt <= new Date() || !Number.isFinite(data.jackpotAmount) || data.jackpotAmount <= 0) {
    fail('Provide a positive draw number and jackpot, and a future schedule', 400)
  }
  return prisma.$transaction(async tx => {
    const games = await tx.$queryRaw<any[]>`SELECT id FROM games WHERE id = ${data.gameId} FOR UPDATE`
    if (!games.length) fail('Game not found', 404)
    const existing = await tx.draw.findFirst({ where: { gameId: data.gameId, drawNumber: data.drawNumber } })
    if (existing) fail('Draw number already exists for this game')
    return tx.draw.create({ data })
  })
}
