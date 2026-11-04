/**
 * Wallet Routes
 * - Balance, deposits, withdrawals, transaction history
 */

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma, redis } from '../server'
import { authenticate, requireAdmin, requireVerifiedEmail, auditLog } from '../middleware/auth'
import { sensitiveRateLimit } from '../middleware/sensitiveRateLimit'
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
        subject: 'Lucky Lotto Play Wallet Verification Code',
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
    preHandler: [authenticate, requireVerifiedEmail, sensitiveRateLimit({ max: 5, timeWindowMs: 60 * 60 * 1000, keyPrefix: 'wallet:withdraw' })],
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    return reply.status(410).send({ success: false, code: 'DIRECT_PAYMENTS_DISABLED',
      error: 'Direct gateway withdrawals are disabled. Use transfer to Coupon Wallet.' })
  })

  // POST /wallet/transfer - Transfer winnings to Coupon Wallet
  app.post('/transfer', {
    preHandler: [authenticate, requireVerifiedEmail, sensitiveRateLimit({ max: 5, timeWindowMs: 60 * 60 * 1000, keyPrefix: 'wallet:transfer' })],
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
      }
      if (!valid && user.twoFactorEnabled && user.twoFactorSecret) {
        try {
          valid = otplib.authenticator.verify({
            token: body.totp,
            secret: user.twoFactorSecret,
          })
        } catch (e) {
          console.error('Transfer TOTP error:', e)
        }
      }
    }

    if (!valid) {
      return reply.status(400).send({ success: false, error: 'Valid verification code required for transfers' })
    }

    const { minWithdrawal, maxWithdrawal, dailyWithdrawalLimit } = await getWalletSettings()

    if (body.amount < minWithdrawal) {
      return reply.status(400).send({ success: false, error: `Minimum transfer is $${minWithdrawal}` })
    }

    if (body.amount > maxWithdrawal) {
      return reply.status(400).send({ success: false, error: `Maximum transfer is $${maxWithdrawal}` })
    }

    // Daily limit check
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dailyTotal = await prisma.transaction.aggregate({
      where: {
        userId,
        type: 'WITHDRAWAL',
        status: { in: ['COMPLETED', 'PENDING'] },
        createdAt: { gte: today },
      },
      _sum: { amount: true },
    })

    if ((Number(dailyTotal._sum.amount) || 0) + body.amount > dailyWithdrawalLimit) {
      return reply.status(400).send({ success: false, error: `Daily transfer limit of $${dailyWithdrawalLimit} exceeded` })
    }

    const reference = `TRF-${randomUUID()}`

    try {
      const transaction = await prisma.$transaction(async (tx) => {
        const [lockedWallet] = await tx.$queryRaw<Array<{ id: string; balance: any }>>`
          SELECT id, balance FROM wallets WHERE "userId" = ${userId} FOR UPDATE
        `

        if (!lockedWallet) {
          throw Object.assign(new Error('Wallet not found'), { code: 'WALLET_NOT_FOUND' })
        }

        const currentBalance = Number(lockedWallet.balance)
        if (currentBalance < body.amount) {
          throw Object.assign(new Error('Insufficient balance'), { code: 'INSUFFICIENT_FUNDS' })
        }

        const balanceAfter = currentBalance - body.amount

        await tx.wallet.update({
          where: { id: lockedWallet.id },
          data: {
            balance: { decrement: body.amount },
            totalWithdrawn: { increment: body.amount },
          },
        })

        return tx.transaction.create({
          data: {
            userId,
            walletId: lockedWallet.id,
            type: 'WITHDRAWAL',
            amount: body.amount,
            balanceBefore: currentBalance,
            balanceAfter,
            currency: 'USD',
            status: 'PENDING',
            reference,
            description: `Transfer to Coupon Wallet`,
          },
        })
      })

      const submission = await submitCouponTransfer({
        transferReference: reference,
        amount: body.amount,
        targetEmail: user.email,
      })

      const finalStatus = submission.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING'
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: finalStatus },
      })

      await auditLog(userId, 'TRANSFER', 'Transaction', transaction.id, undefined, {
        amount: body.amount,
        reference,
        status: finalStatus,
      }, request)

      return reply.send({
        success: true,
        data: {
          id: transaction.id,
          reference,
          amount: body.amount,
          status: finalStatus,
          externalTransferId: submission.externalTransferId,
        },
      })
    } catch (err: any) {
      if (err.code === 'INSUFFICIENT_FUNDS') {
        return reply.status(400).send({ success: false, error: err.message })
      }
      request.log.error(err, 'Failed to process wallet transfer')
      return reply.status(500).send({ success: false, error: 'Transfer failed' })
    }
  })

  // POST /wallet/transfers/:reference/resolve (admin only)
  app.post('/transfers/:reference/resolve', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { reference } = request.params as { reference: string }
    const { action, failureReason } = z.object({
      action: z.enum(['APPROVE', 'FAIL']),
      failureReason: z.string().optional(),
    }).parse(request.body)

    const transaction = await prisma.transaction.findFirst({
      where: { reference, type: 'WITHDRAWAL', status: 'PENDING' },
    })

    if (!transaction) {
      return reply.status(404).send({ success: false, error: 'Pending transfer not found' })
    }

    if (action === 'APPROVE') {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'COMPLETED' },
      })
      await auditLog(request.user.userId, 'TRANSFER_RESOLVED', 'Transaction', transaction.id, { status: 'PENDING' }, { status: 'COMPLETED' }, request)
      return reply.send({ success: true, message: 'Transfer marked as completed' })
    }

    // If failed, refund wallet balance in transaction
    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: transaction.walletId },
        data: {
          balance: { increment: Number(transaction.amount) },
          totalWithdrawn: { decrement: Number(transaction.amount) },
        },
      })

      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'FAILED',
          description: failureReason ? `Transfer failed: ${failureReason}` : 'Transfer failed and refunded',
        },
      })
    })

    await auditLog(request.user.userId, 'TRANSFER_REFUNDED', 'Transaction', transaction.id, { status: 'PENDING' }, { status: 'FAILED', failureReason }, request)
    return reply.send({ success: true, message: 'Transfer marked as failed and balance refunded' })
  })

  // GET /wallet/deposits - Deposit history
  app.get('/deposits', { preHandler: authenticate }, async (request, reply) => {
    const { page = '1', limit = '20', status } = request.query as Record<string, string>
    const limitNum = Math.min(Math.max(1, Number(limit) || 20), 100)
    const skip = (Math.max(1, Number(page) || 1) - 1) * limitNum

    const where: any = { userId: request.user.userId }
    if (status) where.status = status

    const [deposits, total] = await Promise.all([
      prisma.deposit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.deposit.count({ where }),
    ])

    return reply.send({
      success: true,
      data: deposits,
      pagination: {
        page: Math.max(1, Number(page) || 1),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    })
  })

  // GET /wallet/withdrawals - Withdrawal history
  app.get('/withdrawals', { preHandler: authenticate }, async (request, reply) => {
    const { page = '1', limit = '20', status } = request.query as Record<string, string>
    const limitNum = Math.min(Math.max(1, Number(limit) || 20), 100)
    const skip = (Math.max(1, Number(page) || 1) - 1) * limitNum

    const where: any = { userId: request.user.userId }
    if (status) where.status = status

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.withdrawal.count({ where }),
    ])

    return reply.send({
      success: true,
      data: withdrawals,
      pagination: {
        page: Math.max(1, Number(page) || 1),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    })
  })

  // POST /wallet/redeem - Redeem coupon / promo code
  app.post('/redeem', { preHandler: [authenticate, requireVerifiedEmail] }, async (request, reply) => {
    const { code } = redeemSchema.parse(request.body)
    const userId = request.user.userId

    return reply.status(501).send({
      success: false,
      error: 'Coupon redemption endpoint is under maintenance. Please try again shortly.',
      code: 'COUPON_REDEMPTION_MAINTENANCE',
    })
  })
}
