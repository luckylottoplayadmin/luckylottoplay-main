/**
 * Jackpot Service
 * Handles progressive jackpot pool management:
 *   - Scenario A: jackpot winner(s) → split payout → reset to base
 *   - Scenario B: no winner → carry forward → accumulate next contribution
 *
 * All DB writes are passed a Prisma transaction client (tx) so the caller
 * wraps everything in one atomic $transaction block.
 */

import { Prisma } from '@prisma/client'

export interface JackpotProcessResult {
  jackpotBefore: number
  ticketContrib: number
  winnerCount: number
  jackpotPaid: number
  jackpotAfter: number
  rolloverAmount: number
  isRollover: boolean
  perWinnerAmount: number
}

/**
 * Ensure a JackpotPool record exists for a game.
 * Creates one with baseJackpot taken from game.minJackpot if it doesn't exist.
 */
export async function ensureJackpotPool(
  tx: Prisma.TransactionClient,
  gameId: string,
  gameMinJackpot: Prisma.Decimal | number
): Promise<string> {
  const existing = await tx.jackpotPool.findUnique({ where: { gameId } })
  if (existing) return existing.id

  const base = Number(gameMinJackpot) || 1_000_000
  const pool = await tx.jackpotPool.create({
    data: {
      gameId,
      baseJackpot: base,
      currentJackpot: base,
      rolloverAmount: 0,
      currentDrawContrib: 0,
      jackpotContribPct: 60,
    },
  })
  return pool.id
}

/**
 * Core draw-processing function.
 *
 * @param tx             Prisma transaction client
 * @param gameId         Game ID
 * @param drawId         Completed draw ID
 * @param drawNumber     Draw number (for history)
 * @param totalSales     Total ticket revenue for this draw
 * @param jackpotWinners Array of userIds who won the jackpot division
 * @param gameMinJackpot Base jackpot (game.minJackpot)
 */
export async function processDrawJackpot(
  tx: Prisma.TransactionClient,
  gameId: string,
  drawId: string,
  drawNumber: number,
  totalSales: number,
  jackpotWinners: string[],
  gameMinJackpot: Prisma.Decimal | number
): Promise<JackpotProcessResult> {

  // 1. Fetch or create the jackpot pool
  const poolId = await ensureJackpotPool(tx, gameId, gameMinJackpot)
  const pool = await tx.jackpotPool.findUniqueOrThrow({ where: { id: poolId } })

  const jackpotBefore = Number(pool.currentJackpot)
  const contribPct = Number(pool.jackpotContribPct) / 100
  const ticketContrib = Math.floor(totalSales * contribPct * 100) / 100

  let jackpotAfter: number
  let jackpotPaid = 0
  let rolloverAmount = 0
  let isRollover = false
  let perWinnerAmount = 0
  const winnerCount = jackpotWinners.length

  // ── Scenario A: There are jackpot winners ────────────────────────────────
  if (winnerCount > 0) {
    const totalJackpot = jackpotBefore + ticketContrib
    perWinnerAmount = Math.floor((totalJackpot / winnerCount) * 100) / 100
    jackpotPaid = perWinnerAmount * winnerCount
    jackpotAfter = Number(pool.baseJackpot) // reset to base

    // Multiple winning tickets for one user are multiple shares. Aggregate the
    // credit so the unique per-draw/user ledger reference is written once.
    const shares = new Map<string, number>()
    for (const userId of jackpotWinners) shares.set(userId, (shares.get(userId) || 0) + 1)
    for (const [userId, shareCount] of [...shares.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const userPrize = perWinnerAmount * shareCount
      const wallet = await tx.wallet.findUnique({
        where: { userId },
        select: { id: true, balance: true },
      })
      if (!wallet) throw new Error('Jackpot winner wallet not found')

      const balBefore = Number(wallet.balance)
      const balAfter = balBefore + userPrize

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: userPrize },
          totalWon: { increment: userPrize },
        },
      })

      // Individual transaction record
      await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'PRIZE_CREDIT',
          status: 'COMPLETED',
          amount: userPrize,
          balanceBefore: balBefore,
          balanceAfter: balAfter,
          reference: `JACKPOT-WIN-${drawId}-${userId}`,
          description: `Jackpot win — Draw #${drawNumber} (split ${winnerCount} winners)`,
          drawId,
          metadata: { drawNumber, winnerCount, totalJackpot, perWinnerAmount },
        },
      })

      // Winner notification
      await tx.notification.create({
        data: {
          userId,
          title: '🎉 JACKPOT WINNER!',
          message: `You won the jackpot of 🪙${userPrize.toFixed(2)} in Draw #${drawNumber}!`,
          data: { drawId, drawNumber, prize: perWinnerAmount },
        },
      })
    }

    // Jackpot pool audit entries
    await recordJackpotTx(tx, poolId, gameId, drawId, 'CONTRIBUTION', ticketContrib, jackpotBefore, jackpotBefore + ticketContrib)
    await recordJackpotTx(tx, poolId, gameId, drawId, 'JACKPOT_WIN', -jackpotPaid, jackpotBefore + ticketContrib, jackpotAfter)
    if (jackpotBefore + ticketContrib > jackpotPaid) {
      await recordJackpotTx(tx, poolId, gameId, drawId, 'JACKPOT_RESET', -(jackpotBefore + ticketContrib - jackpotPaid), jackpotBefore + ticketContrib, jackpotAfter)
    }

    // Update pool
    await tx.jackpotPool.update({
      where: { id: poolId },
      data: {
        currentJackpot: jackpotAfter,
        rolloverAmount: 0,
        currentDrawContrib: 0,
        consecutiveRollovers: 0,
        totalPaid: { increment: jackpotPaid },
        largestJackpot: jackpotBefore + ticketContrib > Number(pool.largestJackpot)
          ? jackpotBefore + ticketContrib
          : undefined,
        lastWinningDrawId: drawId,
      },
    })

    isRollover = false

  // ── Scenario B: No jackpot winner — roll over ─────────────────────────────
  } else {
    rolloverAmount = jackpotBefore
    jackpotAfter = Number(pool.baseJackpot) + rolloverAmount + ticketContrib

    await recordJackpotTx(tx, poolId, gameId, drawId, 'CONTRIBUTION', ticketContrib, jackpotBefore, jackpotBefore + ticketContrib)
    await recordJackpotTx(tx, poolId, gameId, drawId, 'JACKPOT_ROLLOVER', rolloverAmount, jackpotBefore + ticketContrib, jackpotAfter)

    await tx.jackpotPool.update({
      where: { id: poolId },
      data: {
        currentJackpot: jackpotAfter,
        rolloverAmount: { increment: jackpotBefore },
        currentDrawContrib: ticketContrib,
        consecutiveRollovers: { increment: 1 },
        largestJackpot: jackpotAfter > Number(pool.largestJackpot) ? jackpotAfter : undefined,
      },
    })

    isRollover = true
  }

  // 2. Update Game.jackpotAmount so the public UI reflects the new jackpot
  await tx.game.update({
    where: { id: gameId },
    data: { jackpotAmount: jackpotAfter },
  })

  // 3. Record jackpot history entry
  await tx.jackpotHistory.create({
    data: {
      jackpotPoolId: poolId,
      gameId,
      drawId,
      drawNumber,
      jackpotBefore,
      ticketContrib,
      rolloverAmount: isRollover ? jackpotBefore : 0,
      winnerCount,
      jackpotPaid,
      jackpotAfter,
      winnerUserIds: jackpotWinners,
    },
  })

  return { jackpotBefore, ticketContrib, winnerCount, jackpotPaid, jackpotAfter, rolloverAmount, isRollover, perWinnerAmount }
}

// ── Helper ────────────────────────────────────────────────────────────────────

async function recordJackpotTx(
  tx: Prisma.TransactionClient,
  poolId: string,
  gameId: string,
  drawId: string,
  type: 'CONTRIBUTION' | 'JACKPOT_WIN' | 'JACKPOT_RESET' | 'JACKPOT_ROLLOVER' | 'MANUAL_ADJUSTMENT',
  amount: number,
  before: number,
  after: number,
  description?: string
) {
  await tx.jackpotTransaction.create({
    data: {
      jackpotPoolId: poolId,
      gameId,
      drawId,
      type,
      amount,
      balanceBefore: before,
      balanceAfter: after,
      description: description ?? defaultDesc(type),
    },
  })
}

function defaultDesc(type: string): string {
  const map: Record<string, string> = {
    CONTRIBUTION: 'Ticket sales contribution to jackpot pool',
    JACKPOT_WIN: 'Jackpot paid out to winners',
    JACKPOT_RESET: 'Jackpot pool reset to base amount',
    JACKPOT_ROLLOVER: 'Jackpot rolled over — no winner this draw',
    MANUAL_ADJUSTMENT: 'Manual admin adjustment',
  }
  return map[type] || type
}
