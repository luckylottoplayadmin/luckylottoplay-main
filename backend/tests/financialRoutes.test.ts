import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

const { db } = vi.hoisted(() => ({ db: {
  game: { findUnique: vi.fn() }, draw: { findUnique: vi.fn(), findFirst: vi.fn() },
  wallet: { findUnique: vi.fn(), update: vi.fn() }, ticket: { create: vi.fn() },
  deposit: { create: vi.fn(), update: vi.fn() }, paymentMethod: { findMany: vi.fn() },
  $transaction: vi.fn(), $queryRaw: vi.fn(), notification: { create: vi.fn() },
} }))
vi.mock('../src/server', () => ({ prisma: db, redis: {} }))
vi.mock('../src/middleware/auth', () => ({
  authenticate: async (request: any) => { request.user = { userId: 'user', role: 'ADMIN' } },
  requireAdmin: async () => {}, requireVerifiedEmail: async () => {}, auditLog: vi.fn(),
}))
vi.mock('../src/services/affiliate', () => ({ processAffiliateCommission: vi.fn().mockResolvedValue(undefined) }))
import gameRoutes from '../src/routes/games'
import walletRoutes from '../src/routes/wallet'
import ticketRoutes from '../src/routes/tickets'
import paymentRoutes from '../src/routes/payments'

beforeEach(() => vi.resetAllMocks())

describe('disabled payment and manual claim routes', () => {
  it('blocks direct deposits, confirmations and withdrawals before database writes', async () => {
    const app = Fastify()
    await app.register(walletRoutes, { prefix: '/wallet' })
    try {
      for (const url of ['/wallet/deposit', '/wallet/deposit/deposit-1/confirm', '/wallet/withdraw']) {
        const response = await app.inject({ method: 'POST', url, payload: { amount: 10, gateway: 'STRIPE' } })
        expect(response.statusCode).toBe(410)
        expect(response.json().code).toBe('DIRECT_PAYMENTS_DISABLED')
      }
      expect(db.deposit.create).not.toHaveBeenCalled()
      expect(db.wallet.update).not.toHaveBeenCalled()
      expect(db.$transaction).not.toHaveBeenCalled()
    } finally { await app.close() }
  })
  it('does not offer any direct gateway payment methods', async () => {
    const app = Fastify()
    await app.register(paymentRoutes, { prefix: '/payments' })
    try {
      const response = await app.inject('/payments/methods')
      expect(response.json()).toMatchObject({ success: true, data: [], directPaymentsEnabled: false })
      expect(db.paymentMethod.findMany).not.toHaveBeenCalled()
    } finally { await app.close() }
  })
  it('never re-credits new or legacy prizes through the claim endpoint', async () => {
    const app = Fastify()
    await app.register(ticketRoutes, { prefix: '/tickets' })
    try {
      const response = await app.inject({ method: 'POST', url: '/tickets/legacy-unpaid/claim' })
      expect(response.statusCode).toBe(410)
      expect(db.wallet.update).not.toHaveBeenCalled()
      expect(db.$transaction).not.toHaveBeenCalled()
    } finally { await app.close() }
  })
})

describe('purchase transaction guards', () => {
  it.each([
    { gameId: 'other', status: 'SCHEDULED', scheduledAt: new Date(Date.now() + 7200000) },
    { gameId: 'game', status: 'COMPLETED', scheduledAt: new Date(0) },
    { gameId: 'game', status: 'SCHEDULED', scheduledAt: new Date(Date.now() + 1800000) },
  ])('revalidates the locked draw before debiting the wallet', async currentDraw => {
    const app = Fastify()
    await app.register(gameRoutes, { prefix: '/games' })
    db.game.findUnique.mockResolvedValue({ id: 'game', minNumbers: 2, numberPool: 10, ticketPrice: 1, isActive: true })
    db.draw.findUnique.mockResolvedValueOnce({ id: 'draw', drawNumber: 1 }).mockResolvedValueOnce(currentDraw)
    db.wallet.findUnique.mockResolvedValue({ id: 'wallet' })
    db.$transaction.mockImplementation(async callback => callback(db))
    db.$queryRaw.mockResolvedValue([{ id: 'wallet', balance: 100, bonusBalance: 0 }])
    try {
      const response = await app.inject({ method: 'POST', url: '/games/purchase',
        payload: { gameId: 'game', drawId: 'draw', lines: [{ numbers: [1, 2] }] } })
      expect(response.statusCode).toBe(400)
      expect(response.json().code).toBe('DRAW_CLOSED')
      expect(db.$queryRaw).toHaveBeenCalledTimes(2)
      expect(db.wallet.update).not.toHaveBeenCalled()
      expect(db.ticket.create).not.toHaveBeenCalled()
    } finally { await app.close() }
  })
  it('rejects unsupported multi-draw purchases before any debit', async () => {
    const app = Fastify()
    await app.register(gameRoutes, { prefix: '/games' })
    try {
      const response = await app.inject({ method: 'POST', url: '/games/purchase',
        payload: { gameId: 'game', draws: 5, lines: [{ numbers: [1, 2] }] } })
      expect(response.statusCode).toBeGreaterThanOrEqual(400)
      expect(db.$transaction).not.toHaveBeenCalled()
    } finally { await app.close() }
  })
})
