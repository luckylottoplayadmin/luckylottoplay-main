import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  add: vi.fn(), process: vi.fn(), on: vi.fn(), constructor: vi.fn(),
}))
vi.mock('bull', () => ({
  default: class {
    constructor(...args: unknown[]) { mocks.constructor(...args) }
    add = mocks.add
    process = mocks.process
    on = mocks.on
  },
}))
vi.mock('@prisma/client', () => ({ PrismaClient: class {} }))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function loadQueue(url: string) {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('REDIS_URL', url)
  mocks.add.mockResolvedValue({ id: 'sla-job' })
  mocks.process.mockResolvedValue(undefined)
  await import('../src/jobs/supportQueue')
}

describe('support queue Redis resilience', () => {
  it.each([
    ['rediss://default:test-only@redis.example:6380', true],
    ['redis://localhost:6379', false],
  ])('preserves TLS requirements for %s', async (url, tls) => {
    await loadQueue(url)
    const [name, connection, options] = mocks.constructor.mock.calls[0]
    expect(name).toBe('support')
    expect(connection).toBe(url)
    expect(options.redis.tls).toEqual(tls ? {} : undefined)
    expect(options.redis.maxRetriesPerRequest).toBe(3)
  })

  it('handles scheduling rejection and restores the recurring job after Redis recovers', async () => {
    vi.useFakeTimers()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.resetModules()
    vi.clearAllMocks()
    mocks.process.mockResolvedValue(undefined)
    mocks.add.mockRejectedValueOnce(new Error('Redis unavailable')).mockResolvedValue({ id: 'sla-job' })
    await import('../src/jobs/supportQueue')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('SLA scheduling failed'), 'Redis unavailable')
    expect(mocks.add).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(mocks.add).toHaveBeenCalledTimes(2)
    expect(mocks.add).toHaveBeenLastCalledWith({ type: 'CHECK_SLA', data: {} }, { repeat: { cron: '*/5 * * * *' } })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('handles worker initialization rejection and Redis error events', async () => {
    vi.resetModules()
    vi.clearAllMocks()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.add.mockResolvedValue({ id: 'sla-job' })
    mocks.process.mockRejectedValue(new Error('Worker unavailable'))
    await import('../src/jobs/supportQueue')
    expect(log).toHaveBeenCalledWith('[Support Queue] Worker initialization failed:', 'Worker unavailable')
    const handler = mocks.on.mock.calls.find(([event]) => event === 'error')![1]
    expect(() => handler(new Error('Connection lost'))).not.toThrow()
    expect(log).toHaveBeenCalledWith('[Support Queue] Redis connection error:', 'Connection lost')
  })
})
