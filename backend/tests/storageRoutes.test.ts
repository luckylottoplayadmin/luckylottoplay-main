import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
const { db, storage } = vi.hoisted(() => ({
  db: { session: { findUnique: vi.fn(), update: vi.fn() }, userRoleMapping: { findMany: vi.fn() },
    kYCRecord: { findUnique: vi.fn() }, $transaction: vi.fn() },
  storage: { readImageUpload: vi.fn(), uploadBannerImage: vi.fn(), uploadKycImage: vi.fn(),
    validateOwnedKycImage: vi.fn(), signKycRecord: vi.fn(), redactKycRecord: vi.fn() }
}))
vi.mock('../src/server', () => ({ prisma: db }))
vi.mock('../src/services/objectStorage', () => storage)
vi.mock('../src/routes/adminSupport', () => ({ default: async () => {} }))
import adminRoutes from '../src/routes/admin'
import userRoutes from '../src/routes/users'
const apps: FastifyInstance[] = []
async function app(role = 'USER') {
  const instance = Fastify()
  await instance.register(jwt, { secret: 'test-secret-with-at-least-32-characters' })
  await instance.register(adminRoutes, { prefix: '/admin' })
  await instance.register(userRoutes, { prefix: '/users' })
  apps.push(instance)
  db.session.findUnique.mockResolvedValue({ isActive: true, expiresAt: new Date(Date.now() + 60_000),
    userId: 'user-1', user: { status: 'ACTIVE', role } })
  const headers = { authorization: `Bearer ${instance.jwt.sign({ userId: 'user-1', role, sessionId: 'session-1' })}` }
  return { instance, headers }
}
beforeEach(() => { vi.resetAllMocks(); db.userRoleMapping.findMany.mockResolvedValue([]) })
afterEach(async () => { await Promise.all(apps.splice(0).map(a => a.close())) })

describe('storage API authorization', () => {
  it('blocks anonymous KYC uploads, banner uploads and review links before touching storage', async () => {
    const { instance } = await app()
    for (const [method, url] of [['POST','/users/me/kyc/upload'],['POST','/admin/cms/uploads'],['GET','/admin/kyc/record-1']] as const) {
      expect((await instance.inject({ method, url })).statusCode).toBe(401)
    }
    expect(storage.readImageUpload).not.toHaveBeenCalled()
    expect(storage.signKycRecord).not.toHaveBeenCalled()
  })
  it('denies ordinary users access to banner uploads and KYC review documents', async () => {
    const { instance, headers } = await app()
    expect((await instance.inject({ method: 'POST', url: '/admin/cms/uploads', headers })).statusCode).toBe(403)
    expect((await instance.inject({ url: '/admin/kyc/record-1', headers })).statusCode).toBe(403)
    expect(storage.readImageUpload).not.toHaveBeenCalled()
    expect(db.kYCRecord.findUnique).not.toHaveBeenCalled()
  })
  it('permits CMS:Create uploads but does not grant KYC:View', async () => {
    const { instance, headers } = await app('STAFF')
    db.userRoleMapping.findMany.mockResolvedValue([{ role: { isActive: true, permissions: [{ permission: { module: 'CMS', action: 'Create' } }] } }])
    storage.readImageUpload.mockResolvedValue(Buffer.from('validated image'))
    storage.uploadBannerImage.mockResolvedValue('https://storage.example/banner.jpg')
    expect((await instance.inject({ method: 'POST', url: '/admin/cms/uploads', headers })).statusCode).toBe(201)
    expect((await instance.inject({ url: '/admin/kyc/record-1', headers })).statusCode).toBe(403)
  })
  it('returns signed KYC links only on an authorized uncached detail response', async () => {
    const { instance, headers } = await app('ADMIN')
    const record = { id: 'record-1', documentUrl: 'private-ref', user: { kycRecords: [] } }
    db.kYCRecord.findUnique.mockResolvedValue(record)
    storage.signKycRecord.mockResolvedValue({ ...record, documentUrl: 'https://storage.example/temporary' })
    const result = await instance.inject({ url: '/admin/kyc/record-1', headers })
    expect(result.statusCode).toBe(200)
    expect(result.headers['cache-control']).toBe('private, no-store')
    expect(result.json().data.documentUrl).toContain('temporary')
  })
  it('does not write a KYC submission when the object ownership check fails', async () => {
    const { instance, headers } = await app()
    storage.validateOwnedKycImage.mockRejectedValue(Object.assign(new Error('Document does not belong to this account'), { statusCode: 403 }))
    const result = await instance.inject({ method: 'POST', url: '/users/me/kyc', headers,
      payload: { documentType: 'PASSPORT', documentUrl: 'another-account-reference' } })
    expect(result.statusCode).toBe(403)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
