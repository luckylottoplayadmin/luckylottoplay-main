import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'

const { db, redis } = vi.hoisted(() => ({
  db: {
    setting: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    session: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  redis: { get: vi.fn() },
}))
vi.mock('../src/server', () => ({ prisma: db, redis }))
vi.mock('../src/services/email', () => ({ sendEmail: vi.fn() }))
vi.mock('../src/services/affiliate', () => ({ processAffiliateCommission: vi.fn() }))
vi.mock('../src/routes/adminSupport', () => ({ default: async () => {} }))
import publicCmsRoutes from '../src/routes/publicCms'
import authRoutes from '../src/routes/auth'
import adminRoutes from '../src/routes/admin'

const apps: FastifyInstance[] = []
async function app() {
  const instance = Fastify()
  await instance.register(jwt, { secret: 'test-only-secret-with-at-least-32-characters' })
  apps.push(instance)
  return instance
}
function headers(instance: FastifyInstance) {
  return { authorization: `Bearer ${instance.jwt.sign({ userId: 'user-1', role: 'ADMIN', sessionId: 'session-1' })}` }
}
beforeEach(() => {
  vi.resetAllMocks()
  db.session.findUnique.mockResolvedValue({ isActive: true, expiresAt: new Date(Date.now() + 60_000),
    userId: 'user-1', user: { status: 'ACTIVE', role: 'ADMIN' } })
})
afterEach(async () => {
  await Promise.all(apps.splice(0).map(instance => instance.close()))
  vi.unstubAllEnvs()
})

describe('public CMS settings privacy', () => {
  it('filters private settings even when a caller requests all settings', async () => {
    const settings = [
      { key: 'site_name', value: 'MegaDraw', isPublic: true },
      { key: 'maintenance_mode', value: 'false', isPublic: false },
      { key: 'referral_bonus_amount', value: '10', isPublic: false },
      { key: 'affiliate_commission_rate', value: '10', isPublic: false },
    ]
    db.setting.findMany.mockImplementation(async (query) =>
      settings.filter(setting => !query?.where || setting.isPublic === query.where.isPublic))
    const instance = await app()
    await instance.register(publicCmsRoutes, { prefix: '/cms' })
    for (const url of ['/cms/settings', '/cms/settings?isPublic=false', '/cms/settings?includePrivate=true']) {
      const response = await instance.inject(url)
      expect(response.statusCode).toBe(200)
      expect(response.json().data).toEqual([settings[0]])
    }
    expect(db.setting.findMany).toHaveBeenCalledWith({ where: { isPublic: true } })
  })

  it('keeps the complete settings list behind admin authentication', async () => {
    const instance = await app()
    await instance.register(adminRoutes, { prefix: '/admin' })
    expect((await instance.inject('/admin/settings')).statusCode).toBe(401)
    expect(db.setting.findMany).not.toHaveBeenCalled()
    const settings = [{ key: 'maintenance_mode', value: 'false', isPublic: false }]
    db.setting.findMany.mockResolvedValue(settings)
    const response = await instance.inject({ url: '/admin/settings', headers: headers(instance) })
    expect(response.statusCode).toBe(200)
    expect(response.json().data).toEqual(settings)
  })
})

describe('registration verification', () => {
  it.each(['production', 'development'])('blocks verification skipping in %s without side effects', async environment => {
    vi.stubEnv('NODE_ENV', environment)
    const instance = await app()
    await instance.register(authRoutes, { prefix: '/auth' })
    for (const payload of [{ email: 'pending@example.com' }, { email: 'existing@example.com' }, {}]) {
      const response = await instance.inject({ method: 'POST', url: '/auth/skip-verification', payload })
      expect(response.statusCode).toBe(403)
      expect(response.json().success).toBe(false)
    }
    expect(db.user.findUnique).not.toHaveBeenCalled()
    expect(redis.get).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.auditLog.create).not.toHaveBeenCalled()
  })
})
