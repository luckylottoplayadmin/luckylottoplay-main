/**
 * Admin Routes
 * - User management, KYC approvals, draw management
 * - Financial controls, reports, settings
 */

import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { authenticate, requireAdmin, auditLog } from '../middleware/auth'
import cmsRoutes from './cms'
import adminSupportRoutes from './adminSupport'
import jackpotRoutes from './jackpot'
import crypto from 'crypto'
import { readImageUpload, uploadBannerImage, signKycRecord, redactKycRecord } from '../services/objectStorage'
import { settleDraw, scheduleDraw } from '../services/drawSettlement'

// MED-1: Explicit Zod whitelist for Banner fields — prevents mass-assignment
// against any unexpected columns on the Prisma Banner model.
const bannerSchema = z.object({
  title:       z.string().min(1).max(200),
  subtitle:    z.string().max(500).optional(),
  imageUrl:    z.string().url().optional(),
  linkUrl:     z.string().url().optional(),
  buttonText:  z.string().max(50).optional(),
  isActive:    z.boolean().optional(),
  sortOrder:   z.number().int().min(0).optional(),
  type:        z.string().max(50).optional(),
})

// MED-1: Allowed setting keys for PATCH /settings.
// Any key not in this list will be silently ignored, preventing an operator
// from writing arbitrary configuration into the settings store.
const ALLOWED_SETTING_KEYS = new Set([
  'siteName', 'siteUrl', 'supportEmail', 'maintenanceMode',
  'minDeposit', 'maxDeposit', 'minWithdrawal', 'maxWithdrawal',
  'dailyDepositLimit', 'dailyWithdrawalLimit', 'bonusWalletEnabled',
  'kycRequired', 'defaultCurrency', 'maxTicketsPerDraw',
  'referralBonusAmount', 'welcomeBonusAmount', 'emailNotifications',
  'smsNotifications', 'pushNotifications', 'affiliateEnabled',
  'registrationEnabled', 'twoFactorRequired',
])

export default async function adminRoutes(app: FastifyInstance) {

  // All admin routes require authentication + admin role/permissions check
  app.addHook('preHandler', authenticate)
  
  app.addHook('preHandler', async (request, reply) => {
    const user = request.user
    
    // 1. System-level admins get full bypass
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
      return
    }

    // 2. Resolve module from URL path
    const url = request.url
    let moduleName = ''
    if (url.startsWith('/admin/support')) moduleName = 'Support'
    else if (url.startsWith('/admin/users')) moduleName = 'Users'
    else if (url.startsWith('/admin/kyc')) moduleName = 'KYC'
    else if (url.startsWith('/admin/wallet')) moduleName = 'Wallets'
    else if (url.startsWith('/admin/withdrawals')) moduleName = 'Withdrawals'
    else if (url.startsWith('/admin/games')) moduleName = 'Games'
    else if (url.startsWith('/admin/draws')) moduleName = 'Draws'
    else if (url.startsWith('/admin/jackpot')) moduleName = 'Jackpots'
    else if (url.startsWith('/admin/cms')) moduleName = 'CMS'
    else if (url.startsWith('/admin/settings')) moduleName = 'Settings'
    else if (url.startsWith('/admin/reports')) moduleName = 'Reports'
    else if (url.startsWith('/admin/stats')) moduleName = 'Dashboard'
    else if (url === '/admin' || url === '/admin/') moduleName = 'Dashboard'

    if (!moduleName) {
      return reply.status(403).send({ success: false, error: 'Forbidden', message: 'Access denied' })
    }

    // 3. Resolve action from HTTP method
    // MED-3 FIX: Non-CRUD POST routes (approve, reject, bulk actions, etc.) are
    // semantically 'Edit' operations, not 'Create'. Map them by URL pattern before
    // falling back to the generic verb->action mapping.
    let action = 'View'
    if (request.method === 'PUT' || request.method === 'PATCH') {
      action = 'Edit'
    } else if (request.method === 'DELETE') {
      action = 'Delete'
    } else if (request.method === 'POST') {
      // Routes that act on existing resources (not creating new ones)
      const nonCrudPostPatterns = /\/(approve|reject|bulk|enable|disable|toggle|cancel|process|review|resolve|close|escalate|assign|ban|unban|suspend|activate)(\/?|\/.+)?$/i
      action = nonCrudPostPatterns.test(request.url) ? 'Edit' : 'Create'
    }

    // 4. Check database for permission
    const userMappings = await prisma.userRoleMapping.findMany({
      where: { userId: user.userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true }
            }
          }
        }
      }
    })

    const hasAccess = userMappings.some(mapping => 
      mapping.role.isActive && 
      mapping.role.permissions.some(rp => 
        rp.permission.module === moduleName && rp.permission.action === action
      )
    )

    if (!hasAccess) {
      request.log.warn(`RBAC Denied: User ${user.userId} attempted ${action} on ${moduleName}`)
      return reply.status(403).send({ 
        success: false,
        error: 'Forbidden', 
        message: `You lack the required permission: ${moduleName}:${action}` 
      })
    }
  })

  // Register Sub-routers
  app.post('/cms/uploads', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const url = await uploadBannerImage(await readImageUpload(request))
    return reply.status(201).send({ success: true, data: { url } })
  })

  app.register(cmsRoutes, { prefix: '/cms' })
  app.register(adminSupportRoutes, { prefix: '/support' })
  app.register(jackpotRoutes, { prefix: '/jackpot' })

  // ── Dashboard Stats ───────────────────────────────────────────────────────

  app.get('/stats', async (request, reply) => {
    const [
      totalUsers,
      activeUsers,
      pendingKYC,
      pendingWithdrawals,
      totalRevenue,
      todayTickets,
      activeSessions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.kYCRecord.count({ where: { status: 'PENDING' } }),
      prisma.withdrawal.count({ where: { status: 'PENDING' } }),
      prisma.transaction.aggregate({
        where: { type: 'DEPOSIT', status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.ticket.count({
        where: { purchasedAt: { gte: new Date(Date.now() - 86400000) } },
      }),
      prisma.session.count({ where: { isActive: true, expiresAt: { gt: new Date() } } }),
    ])

    return reply.send({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        pendingKYC,
        pendingWithdrawals,
        totalRevenue: totalRevenue._sum.amount || 0,
        todayTickets,
        activeSessions,
      },
    })
  })

  // ── User Management ───────────────────────────────────────────────────────

  app.get('/users', async (request, reply) => {
    const { page = '1', limit = '20', search, status, role, kycStatus, sortField = 'createdAt', sortDir = 'desc' } = request.query as Record<string, string>
    const limitNum = Math.min(Math.max(1, Number(limit) || 20), 100)
    const skip = (Math.max(1, Number(page) || 1) - 1) * limitNum

    // HIGH-01: Whitelist allowed sort fields to prevent Prisma injection
    const ALLOWED_SORT_FIELDS = ['createdAt', 'email', 'username', 'status', 'lastLoginAt', 'firstName', 'lastName']
    const safeSortField = ALLOWED_SORT_FIELDS.includes(sortField) ? sortField : 'createdAt'
    const safeSortDir = sortDir === 'asc' ? 'asc' : 'desc'

    const where: any = {}
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (status) where.status = status
    if (role) where.role = role
    if (kycStatus) where.kycStatus = kycStatus

    const orderBy: any = {}
    orderBy[safeSortField] = safeSortDir

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limitNum,
        orderBy,
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          emailVerified: true,
          kycStatus: true,
          createdAt: true,
          lastLoginAt: true,
          wallet: { select: { balance: true, totalDeposited: true } },
          roles: { include: { role: { select: { name: true } } } },
        },
      }),
      prisma.user.count({ where }),
    ])

    return reply.send({
      success: true,
      data: users,
      pagination: { page: Math.max(1, Number(page) || 1), limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    })
  })

  app.get('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        wallet: true,
        kycRecords: { orderBy: { submittedAt: 'desc' }, select: { id: true, documentType: true, status: true, submittedAt: true, reviewedAt: true, reviewNotes: true } },
        tickets: {
          orderBy: { purchasedAt: 'desc' },
          take: 10,
          include: { game: { select: { name: true } } },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        sessions: {
          where: { isActive: true },
          select: { id: true, ipAddress: true, lastUsedAt: true, userAgent: true },
        },
        roles: {
          include: { role: true }
        }
      },
    })

    if (!user) return reply.status(404).send({ success: false, error: 'User not found' })

    const { passwordHash, twoFactorSecret, ...safeUser } = user
    return reply.send({ success: true, data: safeUser })
  })


  app.patch('/users/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status, reason } = request.body as { status: string; reason?: string }

    const oldUser = await prisma.user.findUnique({ where: { id }, select: { status: true } })

    await prisma.user.update({ where: { id }, data: { status: status as any } })

    if (status === 'BANNED' || status === 'SUSPENDED') {
      await prisma.session.updateMany({ where: { userId: id }, data: { isActive: false } })
    }

    await auditLog(request.user.userId, 'USER_STATUS_CHANGED', 'User', id, { oldStatus: oldUser?.status }, { newStatus: status, reason }, request)

    return reply.send({ success: true, message: `User status changed to ${status}` })
  })

  // POST /users/bulk-action - Bulk suspend/activate/delete
  app.post('/users/bulk-action', async (request, reply) => {
    const { userIds, action } = request.body as { userIds: string[]; action: 'SUSPEND' | 'ACTIVATE' | 'DELETE' }
    
    if (!userIds || userIds.length === 0) return reply.status(400).send({ success: false, error: 'No users selected' })

    if (action === 'DELETE') {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    } else {
      const status = action === 'ACTIVATE' ? 'ACTIVE' : 'SUSPENDED'
      await prisma.$transaction(async (tx) => {
        await tx.user.updateMany({ where: { id: { in: userIds } }, data: { status } })
        if (status === 'SUSPENDED') {
          await tx.session.updateMany({ where: { userId: { in: userIds } }, data: { isActive: false } })
        }
      })
    }

    await auditLog(request.user.userId, `BULK_${action}`, 'User', 'Multiple', undefined, { count: userIds.length }, request)

    return reply.send({ success: true, message: `Successfully applied ${action} to ${userIds.length} users` })
  })

  // POST /users/:id/wallet/adjust - Manual wallet adjustment
  app.post('/users/:id/wallet/adjust', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { amount, reason, type } = request.body as { amount: number; reason: string; type: 'CREDIT' | 'DEBIT' }

    if (amount <= 0) return reply.status(400).send({ success: false, error: 'Amount must be positive' })

    const user = await prisma.user.findUnique({ where: { id }, include: { wallet: true } })
    if (!user || !user.wallet) return reply.status(404).send({ success: false, error: 'User or wallet not found' })

    if (type === 'DEBIT' && user.wallet.balance.toNumber() < amount) {
      return reply.status(400).send({ success: false, error: 'Insufficient balance for debit' })
    }

    const newBalance = type === 'CREDIT' ? user.wallet.balance.toNumber() + amount : user.wallet.balance.toNumber() - amount

    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: user.wallet!.id },
        data: { balance: newBalance }
      })

      await tx.transaction.create({
        data: {
          userId: id,
          walletId: user.wallet!.id,
          type: type === 'CREDIT' ? 'BONUS_CREDIT' : 'WITHDRAWAL',
          amount: amount,
          balanceBefore: user.wallet!.balance,
          balanceAfter: newBalance,
          status: 'COMPLETED',
          reference: `Admin Adjustment: ${reason}`
        }
      })
    })

    await auditLog(request.user.userId, 'WALLET_ADJUSTED', 'Wallet', user.wallet.id, undefined, { type, amount, reason }, request)

    return reply.send({ success: true, message: `Successfully ${type.toLowerCase()}ed $${amount}`, newBalance })
  })

  // ── KYC Management ────────────────────────────────────────────────────────

  app.get('/kyc', async (request, reply) => {
    const { page = '1', limit = '10', search, status, documentType, sortField = 'submittedAt', sortDir = 'desc' } = request.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const where: any = {}
    if (status) where.status = status
    if (documentType) where.documentType = documentType

    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { username: { contains: search, mode: 'insensitive' } } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [records, total, totalRequests, pendingReview, approvedToday, rejectedToday] = await Promise.all([
      prisma.kYCRecord.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortField]: sortDir },
        include: {
          user: { select: { id: true, email: true, username: true, firstName: true, lastName: true, country: true } },
        },
      }),
      prisma.kYCRecord.count({ where }),
      prisma.kYCRecord.count(),
      prisma.kYCRecord.count({ where: { status: 'PENDING' } }),
      prisma.kYCRecord.count({ where: { status: 'APPROVED', reviewedAt: { gte: today } } }),
      prisma.kYCRecord.count({ where: { status: 'REJECTED', reviewedAt: { gte: today } } }),
    ])

    const stats = { totalRequests, pendingReview, approvedToday, rejectedToday }
    return reply.send({ success: true, data: records.map(redactKycRecord), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }, stats })
  })

  app.get('/kyc/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const record = await prisma.kYCRecord.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            wallet: true,
            sessions: { where: { isActive: true } },
            kycRecords: { orderBy: { submittedAt: 'desc' } }
          }
        }
      }
    })
    if (!record) return reply.status(404).send({ success: false, error: 'KYC Record not found' })
    reply.header('Cache-Control', 'private, no-store')
    const signed = await signKycRecord(record)
    return reply.send({ success: true, data: { ...signed, user: { ...signed.user,
      kycRecords: signed.user.kycRecords.map(redactKycRecord) } } })
  })

  app.patch('/kyc/:id/review', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status, notes } = request.body as { status: 'APPROVED' | 'REJECTED'; notes?: string }

    const record = await prisma.kYCRecord.update({
      where: { id },
      data: { status, reviewedById: request.user.userId, reviewNotes: notes, reviewedAt: new Date() },
    })

    await prisma.user.update({ where: { id: record.userId }, data: { kycStatus: status } })
    await prisma.notification.create({
      data: {
        userId: record.userId,
        title: `Identity verification ${status === 'APPROVED' ? 'approved' : 'rejected'}`,
        message: status === 'APPROVED' ? 'Your identity has been verified.' : `Verification rejected: ${notes || 'Please resubmit.'}`,
      },
    })
    await auditLog(request.user.userId, `KYC_${status}`, 'KYCRecord', id, undefined, { status, notes }, request)
    return reply.send({ success: true, message: `KYC ${status.toLowerCase()}` })
  })

  app.post('/kyc/bulk-action', async (request, reply) => {
    const { recordIds, action, notes } = request.body as { recordIds: string[]; action: 'APPROVED' | 'REJECTED', notes?: string }
    if (!recordIds || recordIds.length === 0) return reply.status(400).send({ success: false, error: 'No records provided' })

    const records = await prisma.kYCRecord.findMany({ where: { id: { in: recordIds } } })
    
    await prisma.kYCRecord.updateMany({
      where: { id: { in: recordIds } },
      data: { status: action, reviewedById: request.user.userId, reviewNotes: notes, reviewedAt: new Date() }
    })

    for (const record of records) {
      await prisma.user.update({ where: { id: record.userId }, data: { kycStatus: action } })
      await prisma.notification.create({
        data: {
          userId: record.userId,
          title: `Identity verification ${action === 'APPROVED' ? 'approved' : 'rejected'}`,
          message: action === 'APPROVED' ? 'Your identity has been verified.' : `Verification rejected: ${notes || 'Please resubmit.'}`,
        },
      })
    }
    
    await auditLog(request.user.userId, `BULK_KYC_${action}`, 'KYCRecord', 'BULK', undefined, { count: recordIds.length }, request)
    return reply.send({ success: true, message: `Successfully ${action.toLowerCase()} ${recordIds.length} records` })
  })

  // ── Affiliate Management ───────────────────────────────────────────────────

  app.get('/affiliates', async (request, reply) => {
    const { page = '1', limit = '10', search, status, sortField = 'createdAt', sortDir = 'desc' } = request.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const where: any = {}
    if (status) where.isActive = status === 'ACTIVE'

    if (search) {
      where.OR = [
        { affiliateCode: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { username: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [records, total, totalAffiliates, activeAffiliates, totalEarned, totalPending] = await Promise.all([
      prisma.affiliateAccount.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortField]: sortDir },
        include: {
          user: { select: { id: true, email: true, username: true, country: true } },
          _count: { select: { commissions: true } }
        },
      }),
      prisma.affiliateAccount.count({ where }),
      prisma.affiliateAccount.count(),
      prisma.affiliateAccount.count({ where: { isActive: true } }),
      prisma.affiliateAccount.aggregate({ _sum: { totalEarned: true } }),
      prisma.affiliateAccount.aggregate({ _sum: { pendingAmount: true } }),
    ])

    const stats = { 
      totalAffiliates, 
      activeAffiliates, 
      totalEarned: totalEarned._sum.totalEarned || 0, 
      totalPending: totalPending._sum.pendingAmount || 0 
    }
    return reply.send({ success: true, data: records, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }, stats })
  })

  app.get('/affiliates/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const record = await prisma.affiliateAccount.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, username: true, firstName: true, lastName: true, phone: true, country: true, createdAt: true } },
        commissions: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    })
    if (!record) return reply.status(404).send({ success: false, error: 'Affiliate not found' })
    return reply.send({ success: true, data: record })
  })

  app.patch('/affiliates/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { isActive, commissionRate } = request.body as { isActive?: boolean; commissionRate?: number }

    const dataToUpdate: any = {}
    if (isActive !== undefined) dataToUpdate.isActive = isActive
    if (commissionRate !== undefined) dataToUpdate.commissionRate = commissionRate

    await prisma.affiliateAccount.update({ where: { id }, data: dataToUpdate })
    await auditLog(request.user.userId, 'AFFILIATE_UPDATED', 'AffiliateAccount', id, undefined, dataToUpdate, request)
    return reply.send({ success: true, message: 'Affiliate updated successfully' })
  })

  app.post('/affiliates/bulk-action', async (request, reply) => {
    const { recordIds, action } = request.body as { recordIds: string[]; action: 'SUSPEND' | 'ACTIVATE' }
    if (!recordIds || recordIds.length === 0) return reply.status(400).send({ success: false, error: 'No records provided' })

    const isActive = action === 'ACTIVATE'
    await prisma.affiliateAccount.updateMany({
      where: { id: { in: recordIds } },
      data: { isActive }
    })

    await auditLog(request.user.userId, `BULK_AFFILIATE_${action}`, 'AffiliateAccount', 'BULK', undefined, { count: recordIds.length }, request)
    return reply.send({ success: true, message: `Successfully ${action.toLowerCase()}d ${recordIds.length} affiliates` })
  })



  // ── Withdrawal Management ─────────────────────────────────────────────────

  app.get('/withdrawals', async (request, reply) => {
    const { page = '1', limit = '20', search, status, sortField = 'createdAt', sortDir = 'desc' } = request.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const where: any = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { wallet: { user: { email: { contains: search, mode: 'insensitive' } } } },
        { wallet: { user: { username: { contains: search, mode: 'insensitive' } } } },
      ]
    }

    const [withdrawals, total, stats] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortField]: sortDir },
        include: {
          wallet: {
            include: { user: { select: { id: true, username: true, email: true, country: true } } }
          }
        }
      }),
      prisma.withdrawal.count({ where }),
      prisma.withdrawal.groupBy({
        by: ['status'],
        _count: true,
        _sum: { amount: true }
      })
    ])

    return reply.send({ success: true, data: withdrawals, pagination: { page: Number(page), limit: Number(limit), total }, stats })
  })

  app.get('/withdrawals/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id },
      include: {
        wallet: {
          include: { user: true }
        }
      }
    })
    if (!withdrawal) return reply.status(404).send({ success: false, error: 'Withdrawal not found' })
    return reply.send({ success: true, data: withdrawal })
  })

  app.patch('/withdrawals/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status, reviewNotes } = request.body as { status: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PENDING', reviewNotes?: string }

    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id },
      include: { wallet: true }
    })
    
    if (!withdrawal) return reply.status(404).send({ success: false, error: 'Withdrawal not found' })

    const updated = await prisma.$transaction(async (tx) => {
      // If rejecting, we must refund the user's balance
      if (status === 'CANCELLED' && withdrawal.status !== 'CANCELLED') {
        await tx.wallet.update({
          where: { id: withdrawal.walletId },
          data: {
            balance: { increment: withdrawal.amount },
            pendingBalance: { decrement: withdrawal.amount }
          }
        })
      }
      
      // If completing, we finalize deduction
      if (status === 'COMPLETED' && withdrawal.status !== 'COMPLETED') {
        await tx.wallet.update({
          where: { id: withdrawal.walletId },
          data: {
            pendingBalance: { decrement: withdrawal.amount },
            totalWithdrawn: { increment: withdrawal.amount }
          }
        })
      }

      return tx.withdrawal.update({
        where: { id },
        data: {
          status,
          reviewNotes,
          reviewedById: request.user.userId,
          processedAt: ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status) ? new Date() : undefined
        }
      })
    })

    await auditLog(request.user.userId, `WITHDRAWAL_${status}`, 'Withdrawal', id, undefined, { amount: updated.amount, reviewNotes }, request)
    return reply.send({ success: true, data: updated })
  })

  // ── Deposit Management ───────────────────────────────────────────────────

  app.get('/deposits', async (request, reply) => {
    const { page = '1', limit = '20', search, status, sortField = 'createdAt', sortDir = 'desc' } = request.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const where: any = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { gatewayRef: { contains: search, mode: 'insensitive' } },
        { wallet: { user: { email: { contains: search, mode: 'insensitive' } } } },
        { wallet: { user: { username: { contains: search, mode: 'insensitive' } } } },
      ]
    }

    const [deposits, total, stats] = await Promise.all([
      prisma.deposit.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortField]: sortDir },
        include: {
          wallet: {
            include: { user: { select: { id: true, username: true, email: true, country: true } } }
          }
        }
      }),
      prisma.deposit.count({ where }),
      prisma.deposit.groupBy({
        by: ['status'],
        _count: true,
        _sum: { amount: true }
      })
    ])

    return reply.send({ success: true, data: deposits, pagination: { page: Number(page), limit: Number(limit), total }, stats })
  })

  app.get('/deposits/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const deposit = await prisma.deposit.findUnique({
      where: { id },
      include: {
        wallet: {
          include: { user: true }
        }
      }
    })
    if (!deposit) return reply.status(404).send({ success: false, error: 'Deposit not found' })
    return reply.send({ success: true, data: deposit })
  })

  app.patch('/deposits/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status, reviewNotes } = request.body as { status: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PENDING', reviewNotes?: string }

    const deposit = await prisma.deposit.findUnique({
      where: { id },
      include: { wallet: true }
    })
    
    if (!deposit) return reply.status(404).send({ success: false, error: 'Deposit not found' })

    const updated = await prisma.$transaction(async (tx) => {
      // If we are forcing a pending/failed deposit to completed
      if (status === 'COMPLETED' && deposit.status !== 'COMPLETED') {
        await tx.wallet.update({
          where: { id: deposit.walletId },
          data: {
            balance: { increment: deposit.amount },
            totalDeposited: { increment: deposit.amount }
          }
        })
      }
      
      // If we are reversing a completed deposit
      if ((status === 'FAILED' || status === 'CANCELLED') && deposit.status === 'COMPLETED') {
        await tx.wallet.update({
          where: { id: deposit.walletId },
          data: {
            balance: { decrement: deposit.amount },
            totalDeposited: { decrement: deposit.amount }
          }
        })
      }

      return tx.deposit.update({
        where: { id },
        data: {
          status,
          processedAt: ['COMPLETED', 'FAILED', 'CANCELLED'].includes(status) ? new Date() : undefined
        }
      })
    })

    await auditLog(request.user.userId, `DEPOSIT_${status}`, 'Deposit', id, undefined, { amount: updated.amount, reviewNotes }, request)
    return reply.send({ success: true, data: updated })
  })

  // ── Wallet Management ──────────────────────────────────────────────────────

  app.post('/wallets/:id/adjustment', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { amount, type, reason } = request.body as { amount: number, type: 'CREDIT' | 'DEBIT' | 'BONUS', reason: string }

    if (!amount || amount <= 0) return reply.status(400).send({ success: false, error: 'Invalid amount' })

    const wallet = await prisma.wallet.findUnique({ where: { id } })
    if (!wallet) return reply.status(404).send({ success: false, error: 'Wallet not found' })

    await prisma.$transaction(async (tx) => {
      const data: any = {}
      let balanceBefore = 0
      let balanceAfter = 0

      if (type === 'CREDIT') {
        balanceBefore = Number(wallet.balance)
        balanceAfter = balanceBefore + amount
        data.balance = { increment: amount }
      } else if (type === 'DEBIT') {
        balanceBefore = Number(wallet.balance)
        if (balanceBefore < amount) throw new Error('Insufficient available balance')
        balanceAfter = balanceBefore - amount
        data.balance = { decrement: amount }
      } else if (type === 'BONUS') {
        balanceBefore = Number(wallet.bonusBalance)
        balanceAfter = balanceBefore + amount
        data.bonusBalance = { increment: amount }
      }

      await tx.wallet.update({
        where: { id },
        data
      })

      await tx.transaction.create({
        data: {
          userId: wallet.userId,
          walletId: id,
          type: type === 'BONUS' ? 'BONUS_CREDIT' : type === 'CREDIT' ? 'DEPOSIT' : 'WITHDRAWAL',
          status: 'COMPLETED',
          amount: type === 'DEBIT' ? -amount : amount,
          balanceBefore,
          balanceAfter,
          reference: `ADJ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          description: `Admin Adjustment: ${reason}`
        }
      })
    })

    await auditLog(request.user.userId, `WALLET_ADJUSTMENT`, 'Wallet', id, undefined, { amount, type, reason }, request)
    return reply.send({ success: true, message: 'Wallet adjusted successfully' })
  })


  // ── Draw Management ────────────────────────────────────────────────────────

  app.post('/draws', async (request, reply) => {
    const { gameId, drawNumber, scheduledAt, jackpotAmount } = request.body as any
    if (!gameId || !drawNumber || !scheduledAt || jackpotAmount === undefined) {
      return reply.status(400).send({ success: false, error: 'Missing required fields' })
    }

    const draw = await scheduleDraw({ gameId, drawNumber: Number(drawNumber),
      scheduledAt: new Date(scheduledAt), jackpotAmount: Number(jackpotAmount) })

    await auditLog(request.user.userId, 'DRAW_SCHEDULED', 'Draw', draw.id, undefined, { gameId, drawNumber, scheduledAt }, request)
    return reply.send({ success: true, message: 'Draw scheduled successfully', data: draw })
  })

  app.get('/draws', async (request, reply) => {
    const { page = '1', limit = '10', search, status, hideCompleted, sortField, sortDir } = request.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const where: any = {}
    if (status) {
      where.status = status
    } else if (hideCompleted === 'true') {
      where.status = { not: 'COMPLETED' }
    }

    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { game: { name: { contains: search, mode: 'insensitive' } } },
      ]
    }

    let orderBy: any = []
    if (sortField && sortDir) {
      orderBy = [{ [sortField]: sortDir }]
    } else if (status === 'SCHEDULED') {
      orderBy = [{ scheduledAt: 'asc' }]
    } else if (status === 'COMPLETED') {
      orderBy = [{ scheduledAt: 'desc' }]
    } else {
      // Default order: SCHEDULED draws first (scheduledAt asc), then IN_PROGRESS, then COMPLETED (scheduledAt desc)
      orderBy = [
        { status: 'desc' }, // 'SCHEDULED' > 'IN_PROGRESS' > 'COMPLETED' in string comparison
        { scheduledAt: 'asc' },
      ]
    }

    const [records, total, totalDraws, liveDraws, scheduledDraws, totalSales] = await Promise.all([
      prisma.draw.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy,
        include: {
          game: { select: { name: true, slug: true, badgeText: true } },
          _count: { select: { tickets: true } }
        },
      }),
      prisma.draw.count({ where }),
      prisma.draw.count(),
      prisma.draw.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.draw.count({ where: { status: 'SCHEDULED' } }),
      prisma.draw.aggregate({ _sum: { totalSales: true } }),
    ])

    const stats = { 
      totalDraws, 
      liveDraws, 
      scheduledDraws,
      totalSales: totalSales._sum.totalSales || 0 
    }
    return reply.send({ success: true, data: records, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }, stats })
  })

  app.get('/draws/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const record = await prisma.draw.findUnique({
      where: { id },
      include: {
        game: {
          include: { prizeDivisions: { orderBy: { divisionOrder: 'asc' } } }
        },
        _count: { select: { tickets: true } }
      }
    })
    if (!record) return reply.status(404).send({ success: false, error: 'Draw not found' })
    return reply.send({ success: true, data: record })
  })

  app.patch('/draws/:id/execute', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      winningNumbers: z.array(z.number().int().positive()),
      supplementary: z.array(z.number().int().positive()).optional(),
      powerball: z.number().int().positive().nullable().optional(),
    }).parse(request.body)
    const result = await settleDraw(id, body as any)
    await auditLog(request.user.userId, 'DRAW_EXECUTED', 'Draw', id, undefined, result, request)
    const draw = await prisma.draw.findUnique({ where: { id } })
    return reply.send({ success: true, message: 'Draw settled; prizes credited automatically.', data: draw })
  })

  app.patch('/draws/:id/publish', async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await settleDraw(id)
    // Publishing only changes visibility; it never credits wallets.
    await prisma.draw.updateMany({ where: { id, status: 'COMPLETED', publishedAt: null },
      data: { publishedAt: new Date() } })
    await auditLog(request.user.userId, 'DRAW_PUBLISHED', 'Draw', id, undefined, result, request)
    return reply.send({ success: true, message: 'Draw results published securely' })
  })

  // ── Game Management ────────────────────────────────────────────────────────

  app.post('/games', async (request, reply) => {
    const data = request.body as any
    const game = await prisma.game.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description || '',
        shortDescription: data.shortDescription || '',
        rulesJson: {},
        drawSchedule: data.drawSchedule || '0 0 * * *',
        jackpotAmount: Number(data.jackpotAmount || 0),
        minJackpot: Number(data.minJackpot || 0),
        ticketPrice: Number(data.ticketPrice || 0),
        minNumbers: Number(data.minNumbers || 6),
        maxNumbers: Number(data.maxNumbers || 6),
        numberPool: Number(data.numberPool || 45),
        hasPowerball: Boolean(data.hasPowerball),
        powerballPool: data.hasPowerball ? Number(data.powerballPool || 20) : null,
        isActive: true,
      }
    })
    await auditLog(request.user.userId, 'GAME_CREATED', 'Game', game.id, undefined, data, request)
    return reply.send({ success: true, message: 'Game created successfully', data: game })
  })

  app.get('/games', async (request, reply) => {
    const { page = '1', limit = '10', search, status, sortField = 'createdAt', sortDir = 'desc' } = request.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const where: any = {}
    if (status) where.isActive = status === 'ACTIVE'

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [records, total, totalGames, activeGames, totalJackpots] = await Promise.all([
      prisma.game.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortField]: sortDir },
        include: {
          _count: { select: { draws: true, tickets: true } }
        },
      }),
      prisma.game.count({ where }),
      prisma.game.count(),
      prisma.game.count({ where: { isActive: true } }),
      prisma.game.aggregate({ _sum: { jackpotAmount: true } }),
    ])

    const stats = { 
      totalGames, 
      activeGames, 
      disabledGames: totalGames - activeGames,
      totalJackpots: totalJackpots._sum.jackpotAmount || 0 
    }
    return reply.send({ success: true, data: records, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }, stats })
  })

  app.get('/games/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const record = await prisma.game.findUnique({
      where: { id },
      include: {
        prizeDivisions: { orderBy: { divisionOrder: 'asc' } },
        draws: {
          orderBy: { scheduledAt: 'desc' },
          take: 5
        }
      }
    })
    if (!record) return reply.status(404).send({ success: false, error: 'Game not found' })
    return reply.send({ success: true, data: record })
  })

  app.patch('/games/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { isActive, jackpotAmount, ticketPrice } = request.body as { isActive?: boolean; jackpotAmount?: number; ticketPrice?: number }

    const dataToUpdate: any = {}
    if (isActive !== undefined) dataToUpdate.isActive = isActive
    if (jackpotAmount !== undefined) dataToUpdate.jackpotAmount = jackpotAmount
    if (ticketPrice !== undefined) dataToUpdate.ticketPrice = ticketPrice

    await prisma.game.update({ where: { id }, data: dataToUpdate })
    await auditLog(request.user.userId, 'GAME_UPDATED', 'Game', id, undefined, dataToUpdate, request)
    return reply.send({ success: true, message: 'Game updated successfully' })
  })

  app.patch('/games/:id/divisions', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { divisions } = request.body as { divisions: any[] }

    // Use a transaction to delete old and create new divisions
    await prisma.$transaction(async (tx) => {
      await tx.prizeDivision.deleteMany({ where: { gameId: id } })
      if (divisions && divisions.length > 0) {
        await tx.prizeDivision.createMany({
          data: divisions.map((div, i) => ({
            id: crypto.randomUUID(),
            gameId: id,
            divisionName: div.divisionName,
            divisionOrder: div.divisionOrder ?? i + 1,
            description: div.description || '',
            fixedPrize: div.fixedPrize ? parseFloat(div.fixedPrize) : null,
            isJackpot: Boolean(div.isJackpot),
            matchNumbers: parseInt(div.matchNumbers),
            matchSupp: div.matchSupp ? parseInt(div.matchSupp) : 0,
            matchPB: Boolean(div.matchPB)
          }))
        })
      }
    })

    await auditLog(request.user.userId, 'GAME_DIVISIONS_UPDATED', 'Game', id, undefined, { divisions }, request)
    return reply.send({ success: true, message: 'Prize divisions updated successfully' })
  })

  app.post('/games/bulk-action', async (request, reply) => {
    const { recordIds, action } = request.body as { recordIds: string[]; action: 'DISABLE' | 'ENABLE' }
    if (!recordIds || recordIds.length === 0) return reply.status(400).send({ success: false, error: 'No records provided' })

    const isActive = action === 'ENABLE'
    await prisma.game.updateMany({
      where: { id: { in: recordIds } },
      data: { isActive }
    })

    await auditLog(request.user.userId, `BULK_GAME_${action}`, 'Game', 'BULK', undefined, { count: recordIds.length }, request)
    return reply.send({ success: true, message: `Successfully ${action.toLowerCase()}d ${recordIds.length} games` })
  })

  // ── Stats ───────────────────────────────────────────────────────────────

  app.get('/reports/revenue', async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string }

    const dateFilter: any = {}
    if (from) dateFilter.gte = new Date(from)
    if (to) dateFilter.lte = new Date(to)

    const [deposits, withdrawals, ticketSales, prizes] = await Promise.all([
      prisma.transaction.aggregate({
        where: { type: 'DEPOSIT', status: 'COMPLETED', createdAt: Object.keys(dateFilter).length ? dateFilter : undefined },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { type: 'WITHDRAWAL', status: 'COMPLETED', createdAt: Object.keys(dateFilter).length ? dateFilter : undefined },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { type: 'TICKET_PURCHASE', status: 'COMPLETED', createdAt: Object.keys(dateFilter).length ? dateFilter : undefined },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { type: 'PRIZE_CREDIT', status: 'COMPLETED', createdAt: Object.keys(dateFilter).length ? dateFilter : undefined },
        _sum: { amount: true },
        _count: true,
      }),
    ])

    return reply.send({
      success: true,
      data: {
        deposits: { total: deposits._sum.amount || 0, count: deposits._count },
        withdrawals: { total: Math.abs(Number(withdrawals._sum.amount) || 0), count: withdrawals._count },
        ticketSales: { total: Math.abs(Number(ticketSales._sum.amount) || 0), count: ticketSales._count },
        prizes: { total: prizes._sum.amount || 0, count: prizes._count },
        netRevenue: (Number(ticketSales._sum.amount) || 0) - (Number(prizes._sum.amount) || 0),
      },
    })
  })

  // ── System Settings ───────────────────────────────────────────────────────

  app.get('/settings', async (request, reply) => {
    const settings = await prisma.setting.findMany({ orderBy: { group: 'asc' } })
    return reply.send({ success: true, data: settings })
  })

  // MED-1: Filter request body to only allowed keys before upserting.
  // An operator with Settings:Edit cannot inject arbitrary configuration entries.
  app.patch('/settings', async (request, reply) => {
    const updates = request.body as Record<string, string>

    const allowedUpdates = Object.entries(updates).filter(([key]) => ALLOWED_SETTING_KEYS.has(key))

    if (allowedUpdates.length === 0) {
      return reply.status(400).send({ success: false, error: 'No valid setting keys provided' })
    }

    await Promise.all(
      allowedUpdates.map(([key, value]) =>
        prisma.setting.upsert({
          where: { key },
          update: { value: String(value) },
          create: { key, value: String(value) },
        })
      )
    )

    return reply.send({ success: true, message: 'Settings updated' })
  })

  // ── Banners / CMS ─────────────────────────────────────────────────────────

  app.get('/banners', async (request, reply) => {
    const banners = await prisma.banner.findMany({ orderBy: { sortOrder: 'asc' } })
    return reply.send({ success: true, data: banners })
  })

  // MED-1: Validate banner body against an explicit whitelist schema.
  app.post('/banners', async (request, reply) => {
    const data = bannerSchema.parse(request.body)
    const banner = await prisma.banner.create({ data: data as any })
    return reply.status(201).send({ success: true, data: banner })
  })

  app.patch('/banners/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = bannerSchema.partial().parse(request.body)
    const banner = await prisma.banner.update({ where: { id }, data: data as any })
    return reply.send({ success: true, data: banner })
  })

  app.delete('/banners/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.banner.delete({ where: { id } })
    return reply.send({ success: true, message: 'Banner deleted' })
  })

  // ── Audit Logs ────────────────────────────────────────────────────────────

  app.get('/audit-logs', async (request, reply) => {
    const { page = '1', limit = '50', userId, action, resource } = request.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const where: any = {}
    if (userId) where.userId = userId
    if (action) where.action = { contains: action, mode: 'insensitive' }
    if (resource) where.resource = resource

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true, username: true } } },
      }),
      prisma.auditLog.count({ where }),
    ])

    return reply.send({ success: true, data: logs, pagination: { page: Number(page), limit: Number(limit), total } })
  })

}

// Helper: determine prize division based on matches
function getDivision(game: any, matchCount: number, hasSupp: boolean, hasPB: boolean): string | null {
  if (game.slug === 'powerball') {
    if (matchCount === 7 && hasPB) return 'Division 1'
    if (matchCount === 7) return 'Division 2'
    if (matchCount === 6 && hasPB) return 'Division 3'
    if (matchCount === 6) return 'Division 4'
    if (matchCount === 5 && hasPB) return 'Division 5'
    if (matchCount === 5) return 'Division 6'
    if (matchCount === 4 && hasPB) return 'Division 7'
    if (matchCount === 3 && hasPB) return 'Division 8'
    if (matchCount === 2 && hasPB) return 'Division 9'
    return null
  }
  // MegaDraw / Saturday Lotto defaults
  if (matchCount === 7) return 'Division 1'
  if (matchCount === 6 && hasSupp) return 'Division 2'
  if (matchCount === 6) return 'Division 3'
  if (matchCount === 5 && hasSupp) return 'Division 4'
  if (matchCount === 5) return 'Division 5'
  if (matchCount === 4) return 'Division 6'
  if (matchCount === 3 && hasSupp) return 'Division 7'
  return null
}

function getPrizeForDivision(draw: any, division: string): number {
  if (division === 'Division 1') return Number(draw.jackpotAmount)
  const prizes: Record<string, number> = {
    'Division 2': 50000,
    'Division 3': 4000,
    'Division 4': 200,
    'Division 5': 30,
    'Division 6': 20,
    'Division 7': 10,
    'Division 8': 7,
    'Division 9': 4,
  }
  return prizes[division] || 0
}
