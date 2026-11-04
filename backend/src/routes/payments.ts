/**
 * Payment Routes
 * - Stripe & PayPal webhooks (with signature verification)
 * - Payment method management (with field whitelisting)
 */

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import Stripe from 'stripe'
import { prisma } from '../server'
import { authenticate, requireAdmin } from '../middleware/auth'

// Whitelisted fields for payment method create/update
const paymentMethodSchema = z.object({
  gateway: z.enum(['STRIPE', 'PAYPAL', 'BANK_TRANSFER', 'CRYPTO']),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  minAmount: z.number().positive(),
  maxAmount: z.number().positive(),
  fees: z.number().min(0).max(1), // 0 = free, 1 = 100%
  isActive: z.boolean(),
})


export default async function paymentRoutes(app: FastifyInstance) {

  // GET /payments/methods - Available payment methods
  app.get('/methods', async (request, reply) => {
    return reply.send({ success: true, data: [], directPaymentsEnabled: false })
  })

  // GET /payments/methods/all - All payment methods (admin)
  app.get('/methods/all', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const methods = await prisma.paymentMethod.findMany({
      orderBy: { gateway: 'asc' },
    })
    return reply.send({ success: true, data: methods })
  })

  // POST /payments/methods - Create payment method (admin) — HIGH-02: field whitelist
  app.post('/methods', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const data = paymentMethodSchema.parse(request.body) as any
    const method = await prisma.paymentMethod.create({ data })
    return reply.status(201).send({ success: true, data: method })
  })

  // PUT /payments/methods/:id - Update payment method (admin) — HIGH-02: field whitelist
  app.put('/methods/:id', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = paymentMethodSchema.partial().parse(request.body) as any
    const method = await prisma.paymentMethod.update({ where: { id }, data })
    return reply.send({ success: true, data: method })
  })

  // POST /payments/stripe/webhook - Stripe webhook with signature verification (CRIT-03)
  app.post('/stripe/webhook', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const sig = request.headers['stripe-signature']
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

    if (!sig || !webhookSecret) {
      request.log.warn('Stripe webhook: missing signature or secret')
      return reply.status(400).send({ error: 'Missing webhook configuration' })
    }

    let event: Stripe.Event
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
      event = stripe.webhooks.constructEvent(
        (request as any).rawBody as Buffer,
        sig as string,
        webhookSecret
      )
    } catch (err: any) {
      request.log.warn(`Stripe webhook signature verification failed: ${err.message}`)
      return reply.status(400).send({ error: 'Invalid webhook signature' })
    }

    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const pi = event.data.object as Stripe.PaymentIntent

          // H-4 FIX: Guard against concurrent/duplicate event delivery.
          // Attempt to record this event.id atomically with the wallet credit.
          // If the INSERT fails on the unique constraint, the event was already
          // processed — skip silently and return 200 to Stripe to stop retries.
          const deposit = await prisma.deposit.findFirst({
            where: { gatewayRef: pi.id, status: 'PENDING' },
            include: { wallet: true },
          })

          if (deposit) {
            try {
              await prisma.$transaction(async (tx) => {
                // Record the event first — throws on duplicate eventId
                await tx.processedWebhookEvent.create({
                  data: { eventId: event.id, source: 'stripe' },
                })

                await tx.deposit.update({
                  where: { id: deposit.id },
                  data: { status: 'COMPLETED', processedAt: new Date() },
                })

                const balBefore = Number(deposit.wallet.balance)
                const amount = Number(deposit.amount)

                await tx.wallet.update({
                  where: { id: deposit.walletId },
                  data: {
                    balance: { increment: amount },
                    totalDeposited: { increment: amount },
                  },
                })

                await tx.transaction.create({
                  data: {
                    userId: deposit.wallet.userId,
                    walletId: deposit.walletId,
                    type: 'DEPOSIT',
                    status: 'COMPLETED',
                    amount,
                    balanceBefore: balBefore,
                    balanceAfter: balBefore + amount,
                    reference: `STRIPE-${pi.id.substring(0, 8)}`,
                    description: 'Stripe deposit',
                  },
                })
              })
            } catch (txErr: any) {
              // Unique constraint violation on eventId = already processed — safe to ignore
              if (txErr?.code === 'P2002' || txErr?.message?.includes('unique constraint')) {
                request.log.info(`Stripe webhook event ${event.id} already processed — skipping`)
              } else {
                throw txErr
              }
            }

            await prisma.notification.create({
              data: {
                userId: deposit.wallet.userId,
                title: 'Deposit confirmed',
                message: `$${deposit.amount} USD has been added to your wallet.`,
              },
            })
          }
          break
        }

        case 'payment_intent.payment_failed': {
          const pi = event.data.object as Stripe.PaymentIntent
          await prisma.deposit.updateMany({
            where: { gatewayRef: pi.id },
            data: { status: 'FAILED' },
          })
          break
        }
      }

      return reply.send({ received: true })
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // GET /payments/withdrawals/pending - Pending withdrawals (admin)
  app.get('/withdrawals/pending', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const { page = '1', limit = '20' } = request.query as Record<string, string>
    const limitNum = Math.min(Math.max(1, Number(limit) || 20), 100)
    const skip = (Math.max(1, Number(page) || 1) - 1) * limitNum

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where: { status: 'PENDING' },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'asc' },
        include: {
          wallet: {
            include: {
              user: { select: { email: true, firstName: true, lastName: true } },
            },
          },
        },
      }),
      prisma.withdrawal.count({ where: { status: 'PENDING' } }),
    ])

    return reply.send({
      success: true,
      data: withdrawals,
      pagination: { page: Math.max(1, Number(page) || 1), limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    })
  })

  // POST /payments/withdrawals/:id/approve - Approve withdrawal (admin)
  // HIGH-1 FIX: Use atomic conditional update (updateMany + count check) so that
  // two concurrent approve clicks cannot both pass the PENDING guard and
  // double-decrement pendingBalance or inflate totalWithdrawn.
  app.post('/withdrawals/:id/approve', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }

    // Fetch wallet info needed for the transaction log (still outside the tx —
    // this is just metadata, the atomic guard is inside the transaction).
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id },
      include: { wallet: true },
    })

    if (!withdrawal) {
      return reply.status(404).send({ success: false, error: 'Withdrawal not found' })
    }

    await prisma.$transaction(async (tx) => {
      // Atomic conditional update: only succeeds if status is still PENDING.
      // If two requests race, only one will find count === 1; the other gets 0
      // and the transaction is aborted before any wallet mutation.
      const { count } = await tx.withdrawal.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'COMPLETED',
          reviewedById: request.user.userId,
          processedAt: new Date(),
        },
      })

      if (count === 0) {
        throw Object.assign(new Error('ALREADY_PROCESSED'), { statusCode: 400 })
      }

      const balBefore = Number(withdrawal.wallet.balance) + Number(withdrawal.wallet.pendingBalance)
      const amount = Number(withdrawal.amount)

      await tx.wallet.update({
        where: { id: withdrawal.walletId },
        data: {
          pendingBalance: { decrement: amount },
          totalWithdrawn: { increment: amount },
        },
      })

      await tx.transaction.create({
        data: {
          userId: withdrawal.wallet.userId,
          walletId: withdrawal.walletId,
          type: 'WITHDRAWAL',
          status: 'COMPLETED',
          amount: -amount,
          balanceBefore: balBefore,
          balanceAfter: balBefore - amount,
          reference: `WD-${id.substring(0, 8).toUpperCase()}`,
          description: `Withdrawal via ${withdrawal.gateway}`,
        },
      })
    }).catch((err) => {
      if (err.message === 'ALREADY_PROCESSED') {
        return reply.status(400).send({ success: false, error: 'Withdrawal is not in PENDING state — already processed or cancelled' })
      }
      throw err
    })

    await prisma.notification.create({
      data: {
        userId: withdrawal.wallet.userId,
        title: 'Withdrawal processed',
        message: `Your withdrawal of $${withdrawal.amount} USD has been processed.`,
      },
    })

    return reply.send({ success: true, message: 'Withdrawal approved and processed' })
  })


  // POST /payments/withdrawals/:id/reject - Reject withdrawal (admin)
  // HIGH-1 FIX: Same atomic pattern as approve — no read-then-write TOCTOU.
  app.post('/withdrawals/:id/reject', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { reason } = request.body as { reason: string }

    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id },
      include: { wallet: true },
    })

    if (!withdrawal) {
      return reply.status(404).send({ success: false, error: 'Withdrawal not found' })
    }

    await prisma.$transaction(async (tx) => {
      // Atomic: only succeeds if withdrawal is still PENDING.
      const { count } = await tx.withdrawal.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'CANCELLED',
          reviewedById: request.user.userId,
          reviewNotes: reason,
        },
      })

      if (count === 0) {
        throw Object.assign(new Error('ALREADY_PROCESSED'), { statusCode: 400 })
      }

      // Return funds to main balance
      await tx.wallet.update({
        where: { id: withdrawal.walletId },
        data: {
          balance: { increment: Number(withdrawal.amount) },
          pendingBalance: { decrement: Number(withdrawal.amount) },
        },
      })
    }).catch((err) => {
      if (err.message === 'ALREADY_PROCESSED') {
        return reply.status(400).send({ success: false, error: 'Withdrawal is not in PENDING state — already processed or cancelled' })
      }
      throw err
    })

    await prisma.notification.create({
      data: {
        userId: withdrawal.wallet.userId,
        title: 'Withdrawal rejected',
        message: `Your withdrawal of $${withdrawal.amount} USD was rejected. Funds have been returned to your wallet. Reason: ${reason}`,
      },
    })

    return reply.send({ success: true, message: 'Withdrawal rejected' })
  })
}
