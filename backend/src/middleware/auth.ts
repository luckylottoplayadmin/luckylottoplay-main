/**
 * Authentication & Authorization Middleware
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../server'
import { resolveClientIp } from './sensitiveRateLimit'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; role: string; sessionId: string }
    user: { userId: string; role: string; sessionId: string }
  }
}

/** Verify JWT and attach user to request */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()

    // Verify session is still active
    const session = await prisma.session.findUnique({
      where: { id: request.user.sessionId },
      select: { isActive: true, expiresAt: true, userId: true,
        user: { select: { status: true, role: true } } },
    })

    if (!session?.isActive || session.expiresAt <= new Date() || session.userId !== request.user.userId) {
      return reply.status(401).send({ success: false, error: 'Session expired' })
    }

    if (session.user.status === 'SUSPENDED' || session.user.status === 'BANNED') {
      return reply.status(403).send({ success: false, error: 'Account suspended' })
    }
    // Authorization must follow current database privileges, not stale JWT claims.
    request.user.role = session.user.role

    // Update last used
    await prisma.session.update({
      where: { id: request.user.sessionId },
      data: { lastUsedAt: new Date() },
    })
  } catch (err) {
    return reply.status(401).send({ success: false, error: 'Unauthorized' })
  }
}

/** Require specific roles */
export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(request.user?.role)) {
      return reply.status(403).send({ success: false, error: 'Insufficient permissions' })
    }
  }
}

/** Admin only */
export const requireAdmin = requireRole('SUPER_ADMIN', 'ADMIN')

/** Support or admin */
export const requireSupport = requireRole('SUPER_ADMIN', 'ADMIN', 'SUPPORT')

/** Check if user account is active */
export async function requireActiveAccount(request: FastifyRequest, reply: FastifyReply) {
  const user = await prisma.user.findUnique({
    where: { id: request.user.userId },
    select: { status: true, emailVerified: true },
  })

  if (!user) {
    return reply.status(401).send({ success: false, error: 'User not found' })
  }

  if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
    return reply.status(403).send({
      success: false,
      error: 'Your account has been suspended. Contact support.',
    })
  }
}

/** Require email verification for sensitive actions */
export async function requireVerifiedEmail(request: FastifyRequest, reply: FastifyReply) {
  const user = await prisma.user.findUnique({
    where: { id: request.user.userId },
    select: { emailVerified: true },
  })

  if (!user?.emailVerified) {
    return reply.status(403).send({
      success: false,
      error: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED',
    })
  }
}

/** Log audit trail */
export async function auditLog(
  userId: string,
  action: string,
  resource: string,
  resourceId?: string,
  oldValues?: object,
  newValues?: object,
  request?: FastifyRequest
) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      resource,
      resourceId,
      oldValues: oldValues as any,
      newValues: newValues as any,
      ipAddress: request ? resolveClientIp(request) : undefined,
      userAgent: request?.headers['user-agent'],
    },
  })
}
