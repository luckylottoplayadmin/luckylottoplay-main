/**
 * Wallet Routes
 * - Balance, deposits, withdrawals, transaction history
 */

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma, redis } from '../server'
import { authenticate, requireAdmin, requireVerifiedEmail, auditLog } from '../middleware/auth'
import { processAffiliateCommission } from '../services/affiliate'
import { randomUUID } from 'crypto'
import { submitCouponTransfer } from '../services/couponTransfer'

const depositSchema = z.object({
  amount: z.number().positive(),
  gateway: z.enum(['STRIPE', 'PAYPAL', 'BANK_TRANSFER', 'CRYPTO']),
  paymentMethodId: z.string().optional(),
})

import * as otplib from 'otplib'

const withdrawalSchema = z.object({
  amount: z.number().positive(),
  gateway: z.enum(['STRIPE', 'PAYPAL', 'BANK_TRANSFER']),
  accountDetails: z.object({
    accountName: z.string(),
    accountNumber: z.string().optional(),
    bsb: z.string().optional(),
    paypalEmail: z.string().email().optional(),
  }),
  totp: z.string().optional(),
})

const redeemSchema = z.object({
  code: z.string().min(3).max(50),
})

async function getWalletSettings() {
  const defaultWallet = {
    minDeposit: 10,
    maxDeposit: 10000,
    minWithdrawal: 10,
    maxWithdrawal: 50000,
    dailyDepositLimit: 20000,
    dailyWithdrawalLimit: 100000,
    bonusWalletEnabled: true,
  }
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { category: 'wallet' } })
    if (setting && setting.data && typeof setting.data === 'object') {
      return { ...defaultWallet, ...(setting.data as any) }
    }
  } catch (err) {
    console.error('Error fetching wallet settings:', err)
  }
  return defaultWallet
}

export default async function walletRoutes(app: FastifyInstance) {

  // GET /wallet - Get wallet info
  app.get('/', { preHandler: authenticate }, async (request, reply) => {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: request.user.userId },
      select: {
        id: true,
        balance: true,
        bonusBalance: true,
        pendingBalance: true,
        currency: true,
        totalDeposited: true,
        totalWithdrawn: true,
        totalWon: true,
        totalSpent: true,
      },
    })

    if (!wallet) return reply.status(404).send({ success: false, error: 'Wallet not found' })

    return reply.send({ success: true, data: wallet })
  })

  // GET /wallet/transactions - Transaction history
  app.get('/transactions', { preHandler: authenticate }, async (request, reply) => {
    const { page = '1', limit = '20', type, status } = request.query as Record<string, string>
    const limitNum = Math.min(Math.max(1, Number(limit) || 20), 100)
    const skip = (Math.max(1, Number(page) || 1) - 1) * limitNum

    const where: any = { userId: request.user.userId }
    if (type) where.type = type
    if (status) where.status = status

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          balanceBefore: true,
          balanceAfter: true,
          currency: true,
          reference: true,
          description: true,
          createdAt: true,
        },
      }),
      prisma.transaction.count({ where }),
    ])

    return reply.send({
      success: true,
      data: transactions,
      pagination: {
        page: Math.max(1, Number(page) || 1),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    })
  })

  // Direct gateway payments are disabled. Coupon redemption remains the
  // supported funding path; old payment clients cannot create or credit deposits.
  app.post('/deposit', { preHandler: authenticate }, async (_request, reply) =>
    reply.status(410).send({ success: false, code: 'DIRECT_PAYMENTS_DISABLED', error: 'Direct payments are disabled. Use coupon redemption.' }))
  app.post('/deposit/:id/confirm', { preHandler: [authenticate, requireAdmin] }, async (_request, reply) =>
    reply.status(410).send({ success: false, code: 'DIRECT_PAYMENTS_DISABLED', error: 'Direct payment confirmation is disabled.' }))

  // POST /wallet/request-email-otp - Request OTP for withdrawals/transfers
  app.post('/request-email-otp', {
    preHandler: [authenticate, requireVerifiedEmail],
    config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
  }, async (request, reply) => {
    const userId = request.user.userId
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ success: false, error: 'User not found' })

    const { randomInt } = require('crypto')
    const code = randomInt(100000, 1000000).toString()
    await redis.set(`email_otp:${userId}:withdraw`, code, 'EX', 300)


    try {
      const { sendEmail } = require('../services/email')
      await sendEmail({
        to: user.email,
        subject: 'MegaDraw Wallet Verification Code',
        template: 'email-otp',
        data: { name: user.firstName, action: 'wallet transfer or withdrawal', code },
      })
    } catch (e) {
      console.error('Failed to send OTP:', e)
      return reply.status(500).send({ success: false, error: 'Failed to send verification email' })
    }

    return reply.send({ success: true, message: 'Verification code sent to email' })
  })

  // POST /wallet/withdraw - Request withdrawal
  app.post('/withdraw', {
    preHandler: [authenticate, requireVerifiedEmail],
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    return reply.status(410).send({ success: false, code: 'DIRECT_PAYMENTS_DISABLED',
      error: 'Direct gateway withdrawals are disabled. Use transfer to Coupon Wallet.' })
  })

  // POST /wallet/transfer - Transfer winnings to Coupon Wallet
  app.post('/transfer', {
    preHandler: [authenticate, requireVerifiedEmail],
    // MED-05: Financial endpoints need very tight rate limits — 5/hour prevents automated drain
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const transferSchema = z.object({
      amount: z.number().positive().min(1),
      totp: z.string().optional(),
    })
    
    const body = transferSchema.parse(request.body)
    const userId = request.user.userId

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, kycStatus: true, twoFactorEnabled: true, twoFactorSecret: true }
    })

    if (!user) return reply.status(404).send({ success: false, error: 'User not found' })

    let valid = false
    const cachedOtp = await redis.get(`email_otp:${userId}:withdraw`)
    
    if (body.totp) {
      if (cachedOtp && cachedOtp === body.totp) {
        valid = true
        await redis.del(`email_otp:${userId}:withdraw`)
      } else if (user.twoFactorEnabled && user.twoFactorSecret) {
        valid = otplib.authenticator.verify({ token: body.totp, secret: user.twoFactorSecret })
      }
      
      if (!valid) {
        return reply.status(400).send({ success: false, error: 'Invalid verification code' })
      }
    } else {
      if (user.twoFactorEnabled && user.twoFactorSecret) {
        return reply.status(400).send({ success: false, error: '2FA code is required', code: '2FA_REQUIRED' })
      } else {
        return reply.status(403).send({ success: false, error: 'You must enable 2-Step Verification or request an Email OTP before transferring funds.', code: '2FA_SETUP_REQUIRED' })
      }
    }

    if (user.kycStatus !== 'APPROVED') {
      return reply.status(403).send({
        success: false,
        error: 'Please complete KYC verification before transferring funds',
        code: 'KYC_REQUIRED',
      })
    }

    // Fetch wallet for initial balance check (precise lock happens inside transaction)
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, balance: true },
    })
    if (!wallet) return reply.status(404).send({ success: false, error: 'Wallet not found' })

    if (Number(wallet.balance) < body.amount) {
      return reply.status(400).send({
        success: false,
        error: 'Insufficient balance for transfer',
      })
    }

    const couponApiKey = process.env.COUPON_API_KEY
    let transferUrl: string
    try {
      const url = new URL(`${process.env.COUPON_API_URL}/wallet/transfer`)
      if (!couponApiKey || (url.protocol !== 'https:' && process.env.NODE_ENV !== 'development')) throw new Error()
      transferUrl = url.toString()
    } catch {
      return reply.status(503).send({ success: false, error: 'Transfers are temporarily unavailable' })
    }
    const transactionId = `TRF-${randomUUID()}`

    // 1. Deduct from game wallet FIRST to ensure funds exist and lock them
    try {
      await prisma.$transaction(async (tx) => {
        // Lock the wallet row to prevent concurrent deductions
        const lockedWallet = await tx.$queryRaw<{balance: number}[]>`
          SELECT id, balance FROM "wallets" WHERE "userId" = ${userId} FOR UPDATE
        `
        if (!lockedWallet[0] || Number(lockedWallet[0].balance) < body.amount) {
          throw new Error('Insufficient balance')
        }
        const balBefore = Number(lockedWallet[0].balance)

        // Deduct wallet
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: { decrement: body.amount },
            totalWithdrawn: { increment: body.amount },
          },
        })

        // Log transaction as PENDING
        await tx.transaction.create({
          data: {
            userId,
            walletId: wallet.id,
            type: 'WITHDRAWAL',
            status: 'PENDING',
            amount: body.amount,
            balanceBefore: balBefore,
            balanceAfter: balBefore - body.amount,
            reference: transactionId,
            description: 'Transfer to Coupon Wallet',
            metadata: { kind: 'COUPON_TRANSFER', userEmail: user.email },
          },
        })
      })
    } catch (err) {
      console.error('Wallet deduction failed:', err)
      return reply.status(400).send({ success: false, error: 'Insufficient balance or wallet error.' })
    }

    // Keep a durable pending record for all ambiguous outcomes. Never refund
    // merely because an acknowledgement was lost after the provider credited.
    const outcome = await submitCouponTransfer(transferUrl, couponApiKey, {
      userId, userEmail: user.email, amount: body.amount, transactionId,
    })
    if (outcome === 'PENDING') {
      await auditLog(userId, 'WALLET_TRANSFER_PENDING', 'Transaction', transactionId,
        undefined, { amount: body.amount }, request)
      return reply.status(202).send({
        success: true,
        message: 'Transfer pending confirmation. Your funds are reserved; please do not submit it again.',
        data: { transactionId, amount: body.amount, status: 'PENDING' },
      })
    }

    // 3. Mark transaction as COMPLETED
    await prisma.transaction.updateMany({
      where: { reference: transactionId, status: 'PENDING' },
      data: { status: 'COMPLETED' }
    })

    await auditLog(userId, 'WALLET_TRANSFER', 'Withdrawal', undefined, undefined, { amount: body.amount, transactionId }, request)

    // Notify user
    await prisma.notification.create({
      data: {
        userId,
        title: 'Transfer Successful',
        message: `$${body.amount} has been transferred to your Coupon Wallet.`,
      },
    })

    return reply.status(200).send({
      success: true,
      message: 'Transfer to Coupon Wallet successful.',
      data: { transactionId, amount: body.amount, status: 'COMPLETED' }
    })
  })

  // Admin reconciliation only after checking the provider's ledger. A unique
  // conditional transition makes concurrent resolutions/refunds idempotent.
  app.post('/transfers/:reference/resolve', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { reference } = request.params as { reference: string }
    const resolution = z.object({
      outcome: z.enum(['COMPLETED', 'FAILED']),
      providerReference: z.string().min(1).max(200),
      notes: z.string().min(10).max(1000),
    }).strict().parse(request.body)
    await prisma.$transaction(async (tx) => {
      const transfer = await tx.transaction.findUnique({ where: { reference } })
      if (!transfer || (transfer.metadata as any)?.kind !== 'COUPON_TRANSFER') {
        throw Object.assign(new Error('Transfer not found'), { statusCode: 404 })
      }
      const { count } = await tx.transaction.updateMany({
        where: { id: transfer.id, status: 'PENDING' },
        data: { status: resolution.outcome,
          metadata: { ...(transfer.metadata as object), ...resolution, resolvedBy: request.user.userId } },
      })
      if (!count) throw Object.assign(new Error('Transfer already resolved'), { statusCode: 409 })
      if (resolution.outcome === 'FAILED') {
        await tx.wallet.update({ where: { id: transfer.walletId }, data: {
          balance: { increment: transfer.amount }, totalWithdrawn: { decrement: transfer.amount },
        } })
      }
      await tx.auditLog.create({ data: { userId: request.user.userId,
        action: 'COUPON_TRANSFER_RESOLVED', resource: 'Transaction', resourceId: transfer.id,
        newValues: resolution, ipAddress: request.ip, userAgent: request.headers['user-agent'],
      } })
    })
    return reply.send({ success: true, message: 'Transfer resolved' })
  })

  // GET /wallet/deposits - Deposit history
  app.get('/deposits', { preHandler: authenticate }, async (request, reply) => {
    const { page = '1', limit = '20' } = request.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const wallet = await prisma.wallet.findUnique({
      where: { userId: request.user.userId },
      select: { id: true },
    })

    if (!wallet) return reply.status(404).send({ success: false, error: 'Wallet not found' })

    const [deposits, total] = await Promise.all([
      prisma.deposit.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.deposit.count({ where: { walletId: wallet.id } }),
    ])

    return reply.send({
      success: true,
      data: deposits,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    })
  })

  // GET /wallet/withdrawals - Withdrawal history
  app.get('/withdrawals', { preHandler: authenticate }, async (request, reply) => {
    const { page = '1', limit = '20' } = request.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const wallet = await prisma.wallet.findUnique({
      where: { userId: request.user.userId },
      select: { id: true },
    })

    if (!wallet) return reply.status(404).send({ success: false, error: 'Wallet not found' })

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
        select: {
          id: true,
          amount: true,
          gateway: true,
          status: true,
          processedAt: true,
          createdAt: true,
        },
      }),
      prisma.withdrawal.count({ where: { walletId: wallet.id } }),
    ])

    return reply.send({
      success: true,
      data: withdrawals,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    })
  })

  // POST /wallet/redeem - Redeem a coupon code
  app.post('/redeem', { preHandler: [authenticate, requireVerifiedEmail] }, async (request, reply) => {
    const body = redeemSchema.parse(request.body)
    const userId = request.user.userId

    const wallet = await prisma.wallet.findUnique({ where: { userId } })
    if (!wallet) return reply.status(404).send({ success: false, error: 'Wallet not found' })

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { country: true } })
    const rawCountry = user?.country || null
    const userCountry = rawCountry ? (rawCountry.trim().length === 2 ? rawCountry.trim().toUpperCase() : (
      rawCountry.trim().toUpperCase() === 'UNITED STATES' || rawCountry.trim().toUpperCase() === 'USA' ? 'US' :
      rawCountry.trim().toUpperCase() === 'INDIA' || rawCountry.trim().toUpperCase() === 'IND' ? 'IN' :
      rawCountry.trim().toUpperCase() === 'AUSTRALIA' || rawCountry.trim().toUpperCase() === 'AUS' ? 'AU' :
      rawCountry.trim().toUpperCase() === 'UNITED KINGDOM' || rawCountry.trim().toUpperCase() === 'UK' ? 'GB' :
      rawCountry.trim().toUpperCase() === 'CANADA' ? 'CA' : rawCountry.trim().toUpperCase().substring(0, 2)
    )) : null

    const codeUpper = body.code.trim().toUpperCase()

    // STEP 1: Verify coupon exists and is valid (read-only, does not lock)
    const verifyUrl = `${process.env.COUPON_API_URL}/coupons/verify`
    const verifyRes = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.COUPON_API_KEY || ''
      },
      body: JSON.stringify({
        couponCode: codeUpper,
        userId: userId,
        gameId: 'lottery-platform',
        userCountry: userCountry
      })
    })

    let verifyData: any
    try {
      verifyData = await verifyRes.json()
    } catch {
      return reply.status(502).send({ success: false, error: 'Bad Gateway: Coupon service returned invalid response.' })
    }

    if (!verifyRes.ok || !verifyData.success) {
      return reply.status(verifyRes.status === 404 ? 404 : 400).send({
        success: false,
        code: verifyData.code || 'INVALID_COUPON',
        error: verifyData.message || 'Failed to verify coupon'
      })
    }

    // Country match guard
    if (
      userCountry &&
      verifyData.countryCode &&
      verifyData.countryCode.trim() !== '' &&
      verifyData.countryCode.trim().toUpperCase() !== userCountry.trim().toUpperCase()
    ) {
      return reply.status(400).send({
        success: false,
        code: 'COUNTRY_MISMATCH',
        error: `Country mismatch: This coupon was issued for ${verifyData.countryCode.trim().toUpperCase()} and cannot be redeemed by an account in ${userCountry.trim().toUpperCase()}`
      })
    }

    const amount = Number(verifyData.amount)
    const couponId = verifyData.couponId

    // Generate a stable wallet transaction ID BEFORE calling the coupon service.
    // This ID is passed to the coupon server as walletTransactionId (required field)
    // and is also used as the gatewayRef for idempotent local wallet crediting.
    // Using couponId + userId gives a deterministic, collision-free value that
    // survives retries without generating duplicate credits.
    const walletTransactionId = `CPN-${couponId}-${userId.substring(0, 8)}`

    // CRIT-2 FIX: STEP 2 — Atomically redeem on the coupon service FIRST.
    // The coupon service does SELECT ... FOR UPDATE internally, so only one
    // concurrent request succeeds; the other gets a clear error here before
    // we touch the local wallet at all. This is the safe direction to fail in.
    const redeemUrl = `${process.env.COUPON_API_URL}/coupons/redeem`
    const redeemRes = await fetch(redeemUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.COUPON_API_KEY || ''
      },
      body: JSON.stringify({
        couponId,
        userId,
        gameId: 'lottery-platform',
        walletTransactionId,  // Required by coupon server for idempotency tracking
        ipAddress: request.ip,
        device: request.headers['user-agent'] || 'unknown',
        userCountry: userCountry,
      })
    })

    let redeemData: any
    try {
      redeemData = await redeemRes.json()
    } catch {
      return reply.status(502).send({ success: false, error: 'Bad Gateway: Coupon service returned invalid response during redemption.' })
    }

    if (!redeemRes.ok || !redeemData.success) {
      // Nothing was credited locally yet — safe to just return the error.
      return reply.status(redeemRes.status === 409 ? 409 : 400).send({
        success: false,
        code: redeemData.code || 'REDEMPTION_FAILED',
        error: redeemData.message || 'Coupon could not be redeemed. It may have already been used.'
      })
    }

    // STEP 3: Credit wallet locally, guarded by a unique constraint on
    // gatewayRef = walletTransactionId so a retried or raced request hits
    // the DB unique constraint and cannot double-credit.
    const gatewayRef = walletTransactionId
    try {
      await prisma.$transaction(async (tx) => {
        const balBefore = Number(wallet.balance)

        // This insert will throw a unique-constraint error if the same couponId
        // was already processed, preventing any double-credit.
        await tx.deposit.create({
          data: {
            walletId: wallet.id,
            amount,
            gateway: 'BANK_TRANSFER',
            gatewayRef,           // unique: prevents double-credit on retry/race
            status: 'COMPLETED',
            processedAt: new Date(),
          },
        })

        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: { increment: amount },
            totalDeposited: { increment: amount },
          },
        })

        await tx.transaction.create({
          data: {
            userId,
            walletId: wallet.id,
            type: 'DEPOSIT',
            status: 'COMPLETED',
            amount,
            balanceBefore: balBefore,
            balanceAfter: balBefore + amount,
            reference: `${gatewayRef}-${Date.now()}`,
            description: 'Coupon Redemption',
          },
        })
      })
    } catch (err: any) {
      // Unique constraint violation on gatewayRef means this coupon was already
      // credited (idempotent safety net). Return success to avoid confusing the user.
      if (err?.code === 'P2002' || err?.message?.includes('unique')) {
        console.warn('WARN: Duplicate coupon credit attempt caught by unique constraint', { userId, couponId, gatewayRef })
        return reply.send({ success: true, message: 'Coupon already redeemed — your balance is up to date.', data: { amount } })
      }
      console.error('CRITICAL: Coupon redeemed on coupon service but local wallet credit failed', { userId, couponId, gatewayRef, err })
      // At this point the coupon IS consumed. The credit failure is retryable;
      // support can manually credit using the gatewayRef as the audit key.
      return reply.status(500).send({ success: false, error: 'Redemption recorded but wallet credit failed. Contact support with code: ' + gatewayRef })
    }

    await auditLog(userId, 'COUPON_REDEEMED', 'Deposit', undefined, undefined, { code: codeUpper, couponId, amount, gatewayRef }, request)

    await prisma.notification.create({
      data: {
        userId,
        title: 'Coupon Redeemed',
        message: `${amount.toFixed(2)} Coins have been added to your wallet.`,
      },
    })

    return reply.send({ success: true, message: 'Coupon redeemed successfully', data: { amount } })
  })
}
