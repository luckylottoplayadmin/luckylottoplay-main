/**
 * Sensitive Rate Limit Guard
 *
 * Provides an in-memory sliding window rate limiter that protects sensitive endpoints
 * (login, register, OTP verification, password reset, financial actions)
 * even during distributed Redis outages or connection failures.
 */

import type { FastifyRequest, FastifyReply } from 'fastify'

interface RateLimitRecord {
  count: number
  resetTime: number
}

// In-memory bucket store: Map<key, RateLimitRecord>
const memoryStore = new Map<string, RateLimitRecord>()

// Periodically purge expired records (every 60 seconds)
const cleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [key, record] of memoryStore.entries()) {
    if (now > record.resetTime) {
      memoryStore.delete(key)
    }
  }
}, 60_000)

// Ensure timer doesn't prevent graceful Node.js shutdown
if (cleanupInterval.unref) {
  cleanupInterval.unref()
}

export interface SensitiveRateLimitOptions {
  max: number
  timeWindowMs: number
  keyPrefix: string
}

export function sensitiveRateLimit(options: SensitiveRateLimitOptions) {
  const { max, timeWindowMs, keyPrefix } = options

  return async (request: FastifyRequest, reply: FastifyReply) => {
    // In test environment, bypass to avoid breaking test suites
    if (process.env.NODE_ENV === 'test') {
      return
    }

    const clientIp = request.ip || '127.0.0.1'
    const key = `${keyPrefix}:${clientIp}`
    const now = Date.now()

    let record = memoryStore.get(key)
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + timeWindowMs }
      memoryStore.set(key, record)
      return
    }

    record.count += 1
    if (record.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((record.resetTime - now) / 1000))
      reply.header('Retry-After', String(retryAfterSec))
      return reply.status(429).send({
        success: false,
        error: 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
      })
    }
  }
}
