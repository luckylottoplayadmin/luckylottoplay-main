import { describe, expect, it, vi } from 'vitest'
import { processDrawJackpot } from '../src/services/jackpot.service'

function transaction() {
  const pool = { id: 'pool', currentJackpot: 100, baseJackpot: 100, jackpotContribPct: 0, largestJackpot: 100 }
  return {
    jackpotPool: { findUnique: vi.fn().mockResolvedValue(pool), findUniqueOrThrow: vi.fn().mockResolvedValue(pool), update: vi.fn() },
    wallet: { findUnique: vi.fn().mockResolvedValue({ id: 'wallet', balance: 20 }), update: vi.fn() },
    transaction: { create: vi.fn() }, notification: { create: vi.fn() },
    jackpotTransaction: { create: vi.fn() }, game: { update: vi.fn() }, jackpotHistory: { create: vi.fn() },
  }
}

describe('jackpot settlement shares', () => {
  it('aggregates two winning tickets belonging to one user into one ledger credit', async () => {
    const tx = transaction()
    const result = await processDrawJackpot(tx as any, 'game', 'draw', 1, 0, ['user', 'user'], 100)
    expect(result.perWinnerAmount).toBe(50)
    expect(result.jackpotPaid).toBe(100)
    expect(tx.wallet.update).toHaveBeenCalledTimes(1)
    expect(tx.wallet.update.mock.calls[0][0].data.balance.increment).toBe(100)
    expect(tx.transaction.create).toHaveBeenCalledTimes(1)
    expect(tx.transaction.create.mock.calls[0][0].data).toMatchObject({ amount: 100, reference: 'JACKPOT-WIN-draw-user' })
  })
  it('fails instead of committing a paid jackpot whose winner has no wallet', async () => {
    const tx = transaction()
    tx.wallet.findUnique.mockResolvedValue(null)
    await expect(processDrawJackpot(tx as any, 'game', 'draw', 1, 0, ['user'], 100)).rejects.toThrow('wallet not found')
    expect(tx.jackpotPool.update).not.toHaveBeenCalled()
    expect(tx.jackpotHistory.create).not.toHaveBeenCalled()
  })
})
