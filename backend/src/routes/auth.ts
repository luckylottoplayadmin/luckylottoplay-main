/**
 * Authentication Routes
 * - Register, Login, Logout, Refresh Token
 * - Email Verification, Password Reset
 * - Two-Factor Authentication
 */

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import argon2 from 'argon2'
import { randomBytes, randomInt, createHash } from 'crypto'
import * as otplib from 'otplib'
import { prisma, redis } from '../server'
import { authenticate, auditLog } from '../middleware/auth'
import { sendEmail } from '../services/email'
import { processAffiliateCommission } from '../services/affiliate'
import { generateQR } from '../utils/qr'
import { sensitiveRateLimit } from '../middleware/sensitiveRateLimit'

// ── Security helpers ──────────────────────────────────────────────────────────

/**
 * HIGH-2: Hash a raw token (refresh token) before storing it in the DB.
 * We store only the SHA-256 digest so that a DB leak does not hand an attacker
 * ready-to-use 30-day session credentials.
 */
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/**
 * MED-4: Centralized argon2id hashing with consistent work-factor parameters.
 * Used for all password-set paths (register, reset-password, change-password)
 * so that tuning in one place is reflected everywhere.
 */
async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, {
    type: argon2.argon2id,
    memoryCost: 65536,  // 64 MiB
    timeCost: 3,
    parallelism: 4,
  })
}

// ── Validation schemas ────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(100),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  country: z.string().optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  referralCode: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string(),
  totp: z.string().optional(),
})

const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
})

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8).max(100),
})

const verifyEmailSchema = z.object({
  email: z.string().email().toLowerCase(),
  token: z.string().length(6),
})

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(100),
})

// ── Route handlers ────────────────────────────────────────────────────────────

export default async function authRoutes(app: FastifyInstance) {
  const devLimit = (max: number, timeWindow: string) => 
    process.env.NODE_ENV !== 'production' 
      ? { max: 10000, timeWindow: '1 minute' } 
      : { max, timeWindow }

  // POST /auth/register
  app.post('/register', {
    preHandler: [sensitiveRateLimit({ max: 50, timeWindowMs: 15 * 60 * 1000, keyPrefix: 'auth:reg' })],
    config: { rateLimit: devLimit(50, '15 minutes') },
  }, async (request, reply) => {
    const body = registerSchema.parse(request.body)

    // Check for existing user
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: body.email }, { username: body.username }] },
    })

    if (existing) {
      const field = existing.email === body.email ? 'email' : 'username'
      return reply.status(409).send({
        success: false,
        error: `An account with this ${field} already exists`,
      })
    }

    // Validate age (18+)
    if (body.dateOfBirth) {
      const dob = new Date(body.dateOfBirth)
      const age = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365)
      if (age < 18) {
        return reply.status(400).send({
          success: false,
          error: 'You must be 18 or older to register',
        })
      }
    }

    // Never place the plaintext password in Redis or its snapshots.
    const { password, ...registration } = body
    const passwordHash = await hashPassword(password)
    await redis.setex(`pending_reg:${body.email}`, 900, JSON.stringify({ ...registration, passwordHash }))

    // Send verification email
    const otp = randomInt(100000, 999999).toString()
    await redis.setex(`email_verify:${body.email}`, 300, otp) // 5m TTL


    let emailSent = true
    try {
      await sendEmail({
        to: body.email,
        subject: 'Verify your Lucky Lotto Play account',
        template: 'email-otp',
        data: {
          name: body.firstName || body.username || 'User',
          action: 'account verification',
          code: otp,
        },
      })
    } catch (emailErr) {
      emailSent = false
      console.error('Verification email failed after retries:', emailErr)
    }


    return reply.status(201).send({
      success: true,
      message: emailSent
        ? 'OTP sent. Please check your email to verify your account.'
        : 'We had trouble sending the verification email. Please try resending the code.',
      data: {
        email: body.email,
        username: body.username,
      },
    })
  })

  // POST /auth/resend-verification
  app.post('/resend-verification', {
    preHandler: [sensitiveRateLimit({ max: 3, timeWindowMs: 5 * 60 * 1000, keyPrefix: 'auth:resend' })],
  }, async (request, reply) => {
    const { email } = forgotPasswordSchema.parse(request.body)
    const user = await prisma.user.findUnique({ where: { email } })
    
    let isPending = false
    let pendingName = ''
    if (!user) {
      const pendingData = await redis.get(`pending_reg:${email}`)
      if (!pendingData) {
        return reply.status(404).send({ success: false, error: 'User not found or registration expired' })
      }
      isPending = true
      pendingName = JSON.parse(pendingData).firstName || JSON.parse(pendingData).username
    } else if (user.emailVerified) {
      return reply.status(400).send({ success: false, error: 'Email is already verified' })
    }

    const otp = randomInt(100000, 999999).toString()
    await redis.setex(`email_verify:${email}`, 300, otp) // 5m TTL

    let emailSent = true
    try {
      await sendEmail({
        to: email,
        subject: 'Verify your Lucky Lotto Play account',
        template: 'email-otp',
        data: {
          name: (isPending ? pendingName : (user?.firstName || user?.username)) || 'User',
          action: 'account verification',
          code: otp,
        },
      })
    } catch (emailErr) {
      emailSent = false
      console.error('Resend verification email failed after retries:', emailErr)
    }


    return reply.send({
      success: true,
      message: emailSent ? 'Verification email resent. Please check your inbox.' : 'Email delivery failed. Please try again later.',
    })
  })

  // POST /auth/login
  app.post('/login', {
    // In-memory sliding window fallback guarantees protection during Redis outages
    preHandler: [sensitiveRateLimit({ max: 5, timeWindowMs: 15 * 60 * 1000, keyPrefix: 'auth:login' })],
    // H-5: Tightened from 10 → 5 attempts per 15 min to reduce credential stuffing window
    config: { rateLimit: devLimit(5, '15 minutes') },
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body)

    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { 
        wallet: { select: { balance: true, bonusBalance: true } },
        roles: { 
          include: { 
            role: { 
              include: { 
                permissions: { include: { permission: true } } 
              } 
            } 
          } 
        }
      },
    })

    if (!user) {
      return reply.status(401).send({ success: false, error: 'Incorrect email or password' })
    }

    // Check password
    const validPassword = await argon2.verify(user.passwordHash, body.password)
    if (!validPassword) {
      await auditLog(user.id, 'LOGIN_FAILED', 'User', user.id, undefined, undefined, request)
      return reply.status(401).send({ success: false, error: 'Incorrect email or password' })
    }

    // Check account status
    if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
      return reply.status(403).send({
        success: false,
        error: 'Account suspended. Please contact support.',
      })
    }

    // Check 2FA
    if (user.twoFactorEnabled) {
      if (!body.totp) {
        return reply.status(200).send({
          success: false,
          requiresTOTP: true,
          message: 'Please enter your verification code',
        })
      }

      let valid = false
      const cachedOtp = await redis.get(`email_otp:${user.id}:login`)
      
      if (cachedOtp && cachedOtp === body.totp) {
        valid = true
        await redis.del(`email_otp:${user.id}:login`)
      }
      
      if (!valid && user.twoFactorSecret) {
        try {
          valid = otplib.authenticator.verify({
            token: body.totp,
            secret: user.twoFactorSecret,
          })
        } catch (e) {
          console.error('TOTP verify error:', e)
        }
      }

      if (!valid) {
        return reply.status(401).send({ success: false, error: 'Invalid verification code' })
      }
    }

    // Create session
    const sessionId = randomBytes(16).toString('hex')
    const accessToken = app.jwt.sign({
      userId: user.id,
      role: user.role,
      sessionId,
    })
    const refreshToken = randomBytes(64).toString('hex')
    // HIGH-2: Store only the SHA-256 hash of the refresh token.
    // The raw token is sent to the client via HttpOnly cookie; only the hash lives in DB.
    const refreshTokenHash = hashToken(refreshToken)

    await prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        // HIGH-2: token (plaintext JWT) column removed — JWTs are self-verifying
        refreshTokenHash,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    })

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: request.ip },
    })

    // Record device history
    await prisma.deviceHistory.upsert({
      where: { id: `${user.id}-${request.ip}`.substring(0, 25) },
      update: { lastSeenAt: new Date() },
      create: {
        userId: user.id,
        deviceName: parseDeviceName(request.headers['user-agent']),
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] || '',
        lastSeenAt: new Date(),
      },
    })

    await auditLog(user.id, 'LOGIN', 'User', user.id, undefined, undefined, request)

    // MED-01 & F-01: Set refresh token as Secure, HttpOnly cookie with __Host- prefix.
    // Host-only cookie: No Domain attribute, Path=/, Secure, HttpOnly, SameSite=Lax.
    const isProd = process.env.NODE_ENV === 'production'
    const cookieFlags = [
      'HttpOnly',
      'SameSite=Lax',
      isProd ? 'Secure' : '',
      'Path=/',
      `Max-Age=${30 * 24 * 60 * 60}`, // 30 days
    ].filter(Boolean).join('; ')

    reply.header('Set-Cookie', [
      `__Host-refresh=${refreshToken}; ${cookieFlags}`,
      `refreshToken=${refreshToken}; ${cookieFlags}`,
    ])

    return reply.send({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          emailVerified: user.emailVerified,
          twoFactorEnabled: user.twoFactorEnabled,
          kycStatus: user.kycStatus,
          wallet: user.wallet,
          roles: user.roles,
        },
      },
    })
  })

  // POST /auth/request-email-otp
  app.post('/request-email-otp', {
    preHandler: [sensitiveRateLimit({ max: 3, timeWindowMs: 5 * 60 * 1000, keyPrefix: 'auth:req-otp' })],
    config: { rateLimit: devLimit(3, '5 minutes') },
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body)
    
    const user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user) return reply.status(401).send({ success: false, error: 'Incorrect email or password' })

    const validPassword = await argon2.verify(user.passwordHash, body.password)
    if (!validPassword) return reply.status(401).send({ success: false, error: 'Incorrect email or password' })

    const code = randomInt(100000, 1000000).toString()
    await redis.set(`email_otp:${user.id}:login`, code, 'EX', 300)


    try {
      await sendEmail({
        to: user.email,
        subject: 'Lucky Lotto Play Login Verification Code',
        template: 'email-otp',
        data: { name: user.firstName, action: 'login', code },
      })
    } catch (e) {
      console.error('Failed to send OTP:', e)
      return reply.status(500).send({ success: false, error: 'Failed to send verification email' })
    }

    return reply.send({ success: true, message: 'Verification code sent to email' })
  })

  // POST /auth/refresh
  app.post('/refresh', async (request, reply) => {
    // Read refresh token from __Host-refresh or refreshToken cookie, request body, or header
    const cookieHeader = request.headers['cookie'] || ''
    const cookieMap = Object.fromEntries(
      cookieHeader.split(';').map((c: string) => {
        const parts = c.trim().split('=')
        return [parts[0], parts.slice(1).join('=')]
      })
    )
    const cookieToken = cookieMap['__Host-refresh'] || cookieMap['refreshToken']
    const bodyToken = (request.body as any)?.refreshToken
    const headerToken = request.headers['x-refresh-token'] as string | undefined

    const refreshToken = cookieToken || bodyToken || headerToken

    if (!refreshToken) {
      return reply.status(401).send({ success: false, error: 'Refresh token required' })
    }

    // HIGH-2: Hash the token value before DB lookup so we never store/compare plaintext.
    const session = await prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
      include: { user: { select: { id: true, role: true, status: true } } },
    })

    if (!session || !session.isActive || session.expiresAt < new Date()) {
      return reply.status(401).send({ success: false, error: 'Invalid or expired refresh token' })
    }

    if (session.user.status === 'BANNED' || session.user.status === 'SUSPENDED') {
      return reply.status(403).send({ success: false, error: 'Account suspended' })
    }

    // Refresh token rotation: generate new refresh token on every renewal
    const newRefreshToken = randomBytes(64).toString('hex')
    const newRefreshTokenHash = hashToken(newRefreshToken)

    const newAccessToken = app.jwt.sign({
      userId: session.user.id,
      role: session.user.role,
      sessionId: session.id,
    })

    await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        lastUsedAt: new Date(),
      },
    })

    const isProd = process.env.NODE_ENV === 'production'
    const cookieFlags = [
      'HttpOnly',
      'SameSite=Lax',
      isProd ? 'Secure' : '',
      'Path=/',
      `Max-Age=${30 * 24 * 60 * 60}`,
    ].filter(Boolean).join('; ')

    reply.header('Set-Cookie', [
      `__Host-refresh=${newRefreshToken}; ${cookieFlags}`,
      `refreshToken=${newRefreshToken}; ${cookieFlags}`,
    ])

    return reply.send({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    })
  })

  // POST /auth/logout
  app.post('/logout', { preHandler: authenticate }, async (request, reply) => {
    await prisma.session.update({
      where: { id: request.user.sessionId },
      data: { isActive: false },
    })

    const isProd = process.env.NODE_ENV === 'production'
    const clearFlags = [
      'HttpOnly',
      'SameSite=Lax',
      isProd ? 'Secure' : '',
      'Path=/',
      'Max-Age=0',
    ].filter(Boolean).join('; ')

    reply.header('Set-Cookie', [
      `__Host-refresh=; ${clearFlags}`,
      `refreshToken=; ${clearFlags}`,
    ])

    return reply.send({ success: true, message: 'Logged out successfully' })
  })

  // POST /auth/verify-email
  app.post('/verify-email', {
    preHandler: [sensitiveRateLimit({ max: 10, timeWindowMs: 5 * 60 * 1000, keyPrefix: 'auth:verify' })],
  }, async (request, reply) => {
    const { email, token } = verifyEmailSchema.parse(request.body)

    // MED-06: Brute-force protection — max 5 attempts per email per 10 minutes
    const attemptKey = `otp_attempts:${email}`
    const attempts = await redis.incr(attemptKey)
    if (attempts === 1) await redis.expire(attemptKey, 600) // 10 min window
    if (attempts > 5) {
      return reply.status(429).send({ success: false, error: 'Too many verification attempts. Please request a new code.' })
    }

    const cachedOtp = await redis.get(`email_verify:${email}`)
    if (!cachedOtp || cachedOtp !== token) {
      return reply.status(400).send({ success: false, error: 'Invalid or expired verification code' })
    }
    // Clear attempt counter on success
    await redis.del(attemptKey)

    const user = await prisma.user.findUnique({ where: { email } })
    
    if (user) {
      // User exists but unverified (old flow compatibility)
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      })
    } else {
      // Check pending registration
      const pendingDataStr = await redis.get(`pending_reg:${email}`)
      if (!pendingDataStr) {
        return reply.status(404).send({ success: false, error: 'User registration not found or expired. Please register again.' })
      }

      const body = JSON.parse(pendingDataStr)

      // Find referrer
      let referrerId: string | undefined
      if (body.referralCode) {
        const referrer = await prisma.user.findFirst({
          where: { referralCode: body.referralCode },
        })
        referrerId = referrer?.id
      }

      if (!body.passwordHash || body.password) {
        await redis.del(`pending_reg:${email}`)
        return reply.status(400).send({ success: false, error: 'Please register again.' })
      }
      const passwordHash = body.passwordHash

      // Create user with wallet
      const newUser = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: body.email,
            username: body.username,
            passwordHash,
            firstName: body.firstName,
            lastName: body.lastName,
            country: body.country,
            phone: body.phone,
            dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
            referredById: referrerId,
            referralCode: randomBytes(6).toString('base64url').toUpperCase().substring(0, 8),
            emailVerified: true,
            emailVerifiedAt: new Date(),
            status: 'ACTIVE',
          },
        })

        await tx.wallet.create({ data: { userId: createdUser.id } })
        await tx.notificationPreference.create({ data: { userId: createdUser.id } })

        return createdUser
      })

      // Trigger referral signup tracking
      processAffiliateCommission({ referredUserId: newUser.id, type: 'SIGNUP' }).catch(console.error)

      await auditLog(newUser.id, 'REGISTER', 'User', newUser.id, undefined, { email: newUser.email }, request)
      await redis.del(`pending_reg:${email}`)
    }

    await redis.del(`email_verify:${email}`)

    return reply.send({ success: true, message: 'Email verified successfully' })
  })

  // Keep an explicit denial for old clients; never create accounts or award
  // referral commissions without the email verification flow.
  app.post('/skip-verification', async (_request, reply) => {
    return reply.status(403).send({
      success: false,
      error: 'Email verification is required. Please verify the code sent to your email.',
    })
  })

  // POST /auth/forgot-password
  app.post('/forgot-password', {
    preHandler: [sensitiveRateLimit({ max: 3, timeWindowMs: 15 * 60 * 1000, keyPrefix: 'auth:forgot' })],
    config: { rateLimit: devLimit(3, '15 minutes') },
  }, async (request, reply) => {
    const { email } = forgotPasswordSchema.parse(request.body)

    const user = await prisma.user.findUnique({ where: { email } })

    // Always return success to prevent email enumeration
    if (user) {
      const resetToken = randomBytes(32).toString('hex')
      await redis.setex(`pwd_reset:${resetToken}`, 3600, user.id) // 1h TTL

      await sendEmail({
        to: user.email,
        subject: 'Reset your Lucky Lotto Play password',
        template: 'password-reset',
        data: {
          name: user.firstName,
          resetUrl: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`,
        },
      })
    }

    return reply.send({
      success: true,
      message: 'If an account exists with this email, a reset link has been sent.',
    })
  })

  // POST /auth/reset-password
  app.post('/reset-password', async (request, reply) => {
    const { token, password } = resetPasswordSchema.parse(request.body)

    const userId = await redis.get(`pwd_reset:${token}`)
    if (!userId) {
      return reply.status(400).send({ success: false, error: 'Invalid or expired reset link' })
    }

    // MED-4: Use the centralized hashPassword helper for consistent argon2id params
    const passwordHash = await hashPassword(password)

    await prisma.user.update({ where: { id: userId }, data: { passwordHash } })

    // Invalidate all sessions
    await prisma.session.updateMany({
      where: { userId },
      data: { isActive: false },
    })

    await redis.del(`pwd_reset:${token}`)
    await auditLog(userId, 'PASSWORD_RESET', 'User', userId, undefined, undefined, request)

    return reply.send({ success: true, message: 'Password reset successfully' })
  })

  // POST /auth/change-password
  app.post('/change-password', { preHandler: authenticate }, async (request, reply) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(request.body)
    const userId = request.user.userId

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ success: false, error: 'User not found' })

    const valid = await argon2.verify(user.passwordHash, currentPassword)
    if (!valid) {
      return reply.status(401).send({ success: false, error: 'Current password is incorrect' })
    }

    // MED-4: Use centralized hashPassword helper (consistent argon2id params)
    const passwordHash = await hashPassword(newPassword)
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } })

    // Invalidate other sessions
    await prisma.session.updateMany({
      where: { userId, NOT: { id: request.user.sessionId } },
      data: { isActive: false },
    })

    await auditLog(userId, 'PASSWORD_CHANGED', 'User', userId, undefined, undefined, request)

    return reply.send({ success: true, message: 'Password changed successfully' })
  })

  // POST /auth/2fa/setup
  app.post('/2fa/setup', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.userId
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    })

    if (user?.twoFactorEnabled) {
      return reply.status(400).send({ success: false, error: '2FA is already enabled' })
    }

    const secret = otplib.authenticator.generateSecret()
    const otpauth = otplib.authenticator.keyuri(user!.email, 'Lucky Lotto Play', secret)
    const qrCode = await generateQR(otpauth)

    // Store secret temporarily until confirmed
    await redis.setex(`2fa_setup:${userId}`, 600, secret) // 10min TTL

    return reply.send({
      success: true,
      data: { secret, qrCode },
    })
  })

  // POST /auth/2fa/confirm
  app.post('/2fa/confirm', { preHandler: authenticate }, async (request, reply) => {
    const { token } = request.body as { token: string }
    const userId = request.user.userId

    const secret = await redis.get(`2fa_setup:${userId}`)
    if (!secret) {
      return reply.status(400).send({ success: false, error: 'Setup session expired. Please restart.' })
    }

    const valid = otplib.authenticator.verify({ token, secret })
    if (!valid) {
      return reply.status(400).send({ success: false, error: 'Invalid code. Try again.' })
    }

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorSecret: secret },
    })

    await redis.del(`2fa_setup:${userId}`)
    await auditLog(userId, '2FA_ENABLED', 'User', userId, undefined, undefined, request)

    return reply.send({ success: true, message: 'Two-factor authentication enabled' })
  })

  // DELETE /auth/2fa
  app.delete('/2fa', { preHandler: authenticate }, async (request, reply) => {
    const { password, token } = request.body as { password: string; token: string }
    const userId = request.user.userId

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ success: false, error: 'User not found' })

    const validPwd = await argon2.verify(user.passwordHash, password)
    if (!validPwd) {
      return reply.status(401).send({ success: false, error: 'Invalid password' })
    }

    const validTOTP = otplib.authenticator.verify({
      token,
      secret: user.twoFactorSecret!,
    })

    if (!validTOTP) {
      return reply.status(401).send({ success: false, error: 'Invalid authenticator code' })
    }

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    })

    await auditLog(userId, '2FA_DISABLED', 'User', userId, undefined, undefined, request)

    return reply.send({ success: true, message: 'Two-factor authentication disabled' })
  })

  // GET /auth/sessions
  app.get('/sessions', { preHandler: authenticate }, async (request, reply) => {
    const sessions = await prisma.session.findMany({
      where: { userId: request.user.userId, isActive: true },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        deviceName: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
      },
    })

    const formattedSessions = sessions.map(s => {
      const parsedDevice = s.deviceName || parseDeviceName(s.userAgent || '')
      const parsedBrowser = parseBrowserName(s.userAgent || '')
      return {
        id: s.id,
        device: parsedDevice,
        browser: parsedBrowser,
        ipAddress: s.ipAddress || '127.0.0.1',
        lastActiveAt: s.lastUsedAt || s.createdAt || new Date(),
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      }
    })

    return reply.send({ success: true, data: formattedSessions })
  })

  // DELETE /auth/sessions/:id
  app.delete('/sessions/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }

    await prisma.session.updateMany({
      where: { id, userId: request.user.userId },
      data: { isActive: false },
    })

    return reply.send({ success: true, message: 'Session terminated' })
  })
}

function parseDeviceName(userAgent?: string): string {
  if (!userAgent) return 'Desktop PC'
  if (/Android/i.test(userAgent)) return 'Android Device'
  if (/iPhone/i.test(userAgent)) return 'iPhone'
  if (/iPad/i.test(userAgent)) return 'iPad'
  if (/Windows/i.test(userAgent)) return 'Windows PC'
  if (/Macintosh/i.test(userAgent)) return 'Mac Workstation'
  if (/Linux/i.test(userAgent)) return 'Linux PC'
  return 'Desktop Device'
}

function parseBrowserName(userAgent?: string): string {
  if (!userAgent) return 'Web Browser'
  if (/Brave/i.test(userAgent)) return 'Brave Browser'
  if (/Chrome/i.test(userAgent) && !/Edg/i.test(userAgent)) return 'Google Chrome'
  if (/Edg/i.test(userAgent)) return 'Microsoft Edge'
  if (/Firefox/i.test(userAgent)) return 'Mozilla Firefox'
  if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) return 'Apple Safari'
  return 'Web Browser'
}
