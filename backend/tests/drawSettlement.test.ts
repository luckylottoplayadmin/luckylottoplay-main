import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, tx, jackpot } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(), draw: { findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    transaction: { findFirst: vi.fn(), create: vi.fn() }, winningEntry: { count: vi.fn(), create: vi.fn() },
    ticket: { findMany: vi.fn(), update: vi.fn() }, wallet: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    notification: { create: vi.fn() }, drawSettlement: { create: vi.fn() },
  }
  return { db: { draw: { findUnique: vi.fn() }, $transaction: vi.fn() }, tx, jackpot: vi.fn() }
})
vi.mock('../src/server', () => ({ prisma: db }))
vi.mock('../src/services/jackpot.service', () => ({ processDrawJackpot: jackpot }))
import { settleDraw, nextDrawDate, evaluateTicket, generateDrawResult } from '../src/services/drawSettlement'
import { assertDrawOpen } from '../src/services/drawEligibility'

const division = { divisionName: 'Match 2', divisionOrder: 1, matchNumbers: 2, matchSupp: 0, matchPB: false, isJackpot: false, fixedPrize: 10 }
const game = { id: 'game', minNumbers: 2, numberPool: 10, minJackpot: 100, hasSupplementary: false,
  hasPowerball: false, drawSchedule: '* * * * *', prizeDivisions: [division] }
const result = { winningNumbers: [1, 2], supplementary: [], powerball: null }
let draw: any
beforeEach(() => {
  vi.resetAllMocks()
  draw = { id: 'draw', gameId: 'game', drawNumber: 1, scheduledAt: new Date(0), status: 'SCHEDULED',
    totalSales: 10, totalPrizes: 0, game, settlement: null }
  db.draw.findUnique.mockResolvedValue({ gameId: 'game' })
  db.$transaction.mockImplementation(callback => callback(tx))
  tx.$queryRaw.mockResolvedValue([{ id: 'wallet' }])
  tx.draw.findUnique.mockImplementation(async () => draw)
  tx.transaction.findFirst.mockResolvedValue(null)
  tx.winningEntry.count.mockResolvedValue(0)
  tx.ticket.findMany.mockResolvedValue([{ id: 'ticket', userId: 'user', numbers: [{ numbers: [1, 2] }] }])
  tx.wallet.findUniqueOrThrow.mockResolvedValue({ id: 'wallet', balance: 20 })
  tx.draw.findFirst.mockResolvedValue(null)
  jackpot.mockResolvedValue({ perWinnerAmount: 100, jackpotAfter: 100 })
})

describe('draw settlement service', () => {
  it('credits a winning ticket and records its paid state and unique settlement in the same transaction', async () => {
    const summary = await settleDraw('draw', result)
    expect(summary.totalPrizes).toBe(10)
    expect(tx.wallet.update).toHaveBeenCalledWith({ where: { id: 'wallet' }, data: { balance: { increment: 10 }, totalWon: { increment: 10 } } })
    expect(tx.winningEntry.create.mock.calls[0][0].data).toMatchObject({ ticketId: 'ticket', isPaid: true, paidAt: expect.any(Date) })
    expect(tx.drawSettlement.create.mock.calls[0][0].data.drawId).toBe('draw')
    expect(tx.draw.create).toHaveBeenCalledTimes(1)
  })
  it('returns an existing settlement without running jackpot or wallet credits again', async () => {
    draw = { ...draw, status: 'COMPLETED', settlement: { summary: { drawId: 'draw', totalPrizes: 10 } } }
    expect(await settleDraw('draw')).toMatchObject({ alreadySettled: true, totalPrizes: 10 })
    expect(jackpot).not.toHaveBeenCalled()
    expect(tx.wallet.update).not.toHaveBeenCalled()
  })
  it('credits once when two settlement requests contend for the same transaction locks', async () => {
    let tail = Promise.resolve()
    db.$transaction.mockImplementation(callback => {
      const operation = tail.then(() => callback(tx))
      tail = operation.then(() => undefined, () => undefined)
      return operation
    })
    tx.drawSettlement.create.mockImplementation(async ({ data }) => {
      draw = { ...draw, status: 'COMPLETED', settlement: { summary: data.summary } }
      return data
    })
    const results = await Promise.all([settleDraw('draw', result), settleDraw('draw', result)])
    expect(results.filter(r => r.alreadySettled)).toHaveLength(1)
    expect(tx.wallet.update).toHaveBeenCalledTimes(1)
    expect(tx.drawSettlement.create).toHaveBeenCalledTimes(1)
  })
  it('rechecks completion after taking row locks instead of using the initial lookup', async () => {
    draw.status = 'COMPLETED'
    expect(await settleDraw('draw')).toMatchObject({ alreadySettled: true })
    expect(tx.ticket.findMany).not.toHaveBeenCalled()
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2)
  })
  it('recovers an interrupted draw using its stored numbers', async () => {
    draw = { ...draw, status: 'IN_PROGRESS', ...result }
    await settleDraw('draw')
    expect(tx.draw.update.mock.calls[0][0].data.winningNumbers).toEqual([1, 2])
    expect(tx.wallet.update).toHaveBeenCalledTimes(1)
  })
  it('refuses to overwrite a stored result during recovery', async () => {
    draw = { ...draw, status: 'IN_PROGRESS', ...result }
    await expect(settleDraw('draw', { winningNumbers: [3, 4] })).rejects.toThrow('already recorded')
    expect(tx.wallet.update).not.toHaveBeenCalled()
  })
  it('stops legacy partial payouts for reconciliation instead of paying twice', async () => {
    tx.transaction.findFirst.mockResolvedValue({ id: 'old-credit' })
    await expect(settleDraw('draw', result)).rejects.toThrow('reconciliation')
    expect(jackpot).not.toHaveBeenCalled()
  })
  it('propagates a ledger failure so the enclosing transaction rolls back', async () => {
    tx.transaction.create.mockRejectedValue(new Error('ledger insert failed'))
    await expect(settleDraw('draw', result)).rejects.toThrow('ledger insert failed')
    expect(tx.drawSettlement.create).not.toHaveBeenCalled()
    expect(tx.winningEntry.create).not.toHaveBeenCalled()
  })
  it('never marks a missing-wallet winner as paid', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'game' }]).mockResolvedValueOnce([{ id: 'draw' }]).mockResolvedValueOnce([])
    await expect(settleDraw('draw', result)).rejects.toThrow('no wallet')
    expect(jackpot).not.toHaveBeenCalled()
    expect(tx.winningEntry.create).not.toHaveBeenCalled()
  })
  it('rejects future draws without changing results or money', async () => {
    draw.scheduledAt = new Date(Date.now() + 600_000)
    await expect(settleDraw('draw', result)).rejects.toThrow('scheduled time')
    expect(tx.draw.update).not.toHaveBeenCalled()
  })
  it('does not demote a jackpot-winning ticket when a later line wins a smaller prize', () => {
    const divisions = [{ ...division, isJackpot: true }, { ...division, matchNumbers: 1, fixedPrize: 5 }]
    const ticket = { numbers: [{ numbers: [1, 2] }, { numbers: [1, 3] }] }
    expect(evaluateTicket(ticket, divisions, result).isJackpot).toBe(true)
  })
  it('uses cron-parser v5 to schedule consecutive future draws', () => {
    const first = nextDrawDate('0 20 * * *', new Date('2026-11-04T20:00:00Z'))
    expect(first.toISOString()).toBe('2026-11-05T20:00:00.000Z')
    expect(nextDrawDate('0 20 * * *', first).toISOString()).toBe('2026-11-06T20:00:00.000Z')
  })
  it('generates unique supplementary balls without reusing main numbers', () => {
    const value = generateDrawResult({ ...game, hasSupplementary: true, suppNumbers: 2 })
    expect(value.supplementary).toHaveLength(2)
    expect(new Set([...value.winningNumbers, ...value.supplementary!]).size).toBe(4)
  })
})

describe('purchase eligibility at the transaction boundary', () => {
  const now = new Date('2026-11-04T10:00:00Z')
  const open = { gameId: 'game', status: 'SCHEDULED', scheduledAt: new Date('2026-11-04T12:00:00Z') }
  it('allows an open draw for the selected game', () => expect(() => assertDrawOpen(open, 'game', now)).not.toThrow())
  it.each([
    { ...open, gameId: 'other-game' }, { ...open, status: 'COMPLETED' }, { ...open, status: 'IN_PROGRESS' },
    { ...open, scheduledAt: new Date('2026-11-04T11:00:00Z') }, { ...open, scheduledAt: new Date('2026-11-04T09:00:00Z') },
    { ...open, winningNumbers: [1, 2] }, null,
  ])('rejects an ineligible draw without allowing a debit', draw => expect(() => assertDrawOpen(draw, 'game', now)).toThrow())
})
