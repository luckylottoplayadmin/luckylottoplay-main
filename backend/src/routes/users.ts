import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { authenticate, auditLog } from '../middleware/auth'
import { readImageUpload, uploadKycImage, validateOwnedKycImage } from '../services/objectStorage'

const kycSchema = z.object({
  documentType: z.string().min(1).max(50),
  documentUrl: z.string().min(1).max(500),
  selfieUrl: z.string().max(500).optional().nullable(),
})

// HIGH-02: Whitelist notification preference fields
const notifPrefsSchema = z.object({
  emailDeposits: z.boolean().optional(),
  emailWithdrawals: z.boolean().optional(),
  emailPromotions: z.boolean().optional(),
  emailNewsletters: z.boolean().optional(),
  pushDeposits: z.boolean().optional(),
  pushWithdrawals: z.boolean().optional(),
  pushPromotions: z.boolean().optional(),
  smsDeposits: z.boolean().optional(),
  smsWithdrawals: z.boolean().optional(),
  smsPromotions: z.boolean().optional(),
})

// MED-2: Validate PATCH /me body — prevents untyped/oversized fields reaching Prisma.
// Scoped to the caller's own row only (no IDOR risk), but consistent Zod
// validation avoids Prisma-level 500s from wrong types and defends in depth.
const patchMeSchema = z.object({
  firstName:   z.string().min(1).max(50).optional(),
  lastName:    z.string().min(1).max(50).optional(),
  phone:       z.string().max(20).optional().nullable(),
  country:     z.string().max(80).optional().nullable(),
  state:       z.string().max(80).optional().nullable(),
  city:        z.string().max(80).optional().nullable(),
  address:     z.string().max(200).optional().nullable(),
  postcode:    z.string().max(20).optional().nullable(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional().nullable(),
})

export default async function userRoutes(app: FastifyInstance) {

  app.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: {
        id: true, email: true, username: true, firstName: true, lastName: true,
        dateOfBirth: true, phone: true, role: true, status: true,
        emailVerified: true, twoFactorEnabled: true, kycStatus: true,
        referralCode: true, country: true, state: true, city: true,
        address: true, postcode: true, createdAt: true, lastLoginAt: true,
        wallet: { select: { balance: true, bonusBalance: true, pendingBalance: true } },
        notificationPrefs: true,
        roles: { 
          include: { 
            role: { 
              include: { 
                permissions: { include: { permission: true } } 
              } 
            } 
          } 
        },
      },
    })
    if (!user) return reply.status(404).send({ success: false, error: 'User not found' })
    return reply.send({ success: true, data: user })
  })

  app.patch('/me', { preHandler: authenticate }, async (request, reply) => {
    // MED-2: Validate and whitelist all fields before writing to Prisma.
    const body = patchMeSchema.parse(request.body)

    const updateData: any = {
      ...(body.firstName   !== undefined && { firstName: body.firstName }),
      ...(body.lastName    !== undefined && { lastName:  body.lastName  }),
      ...(body.phone       !== undefined && { phone:     body.phone     }),
      ...(body.country     !== undefined && { country:   body.country   }),
      ...(body.state       !== undefined && { state:     body.state     }),
      ...(body.city        !== undefined && { city:      body.city      }),
      ...(body.address     !== undefined && { address:   body.address   }),
      ...(body.postcode    !== undefined && { postcode:  body.postcode  }),
    }
    if (body.dateOfBirth) {
      updateData.dateOfBirth = new Date(body.dateOfBirth)
    }

    const user = await prisma.user.update({
      where: { id: request.user.userId },
      data: updateData,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, country: true, state: true, city: true, address: true, postcode: true,
        dateOfBirth: true,
      },
    })

    await auditLog(request.user.userId, 'PROFILE_UPDATED', 'User', request.user.userId, undefined, undefined, request)
    return reply.send({ success: true, data: user })
  })

  app.patch('/me/notifications', { preHandler: authenticate }, async (request, reply) => {
    const validated = notifPrefsSchema.partial().parse(request.body)
    const prefs = await prisma.notificationPreference.upsert({
      where: { userId: request.user.userId },
      update: validated as any,
      create: { userId: request.user.userId, ...(validated as any) },
    })
    return reply.send({ success: true, data: prefs })
  })

  app.get('/me/devices', { preHandler: authenticate }, async (request, reply) => {
    const devices = await prisma.deviceHistory.findMany({
      where: { userId: request.user.userId },
      orderBy: { lastSeenAt: 'desc' },
    })
    return reply.send({ success: true, data: devices })
  })

  app.post('/me/kyc/upload', { preHandler: authenticate,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const reference = await uploadKycImage(request.user.userId, await readImageUpload(request))
    return reply.status(201).send({ success: true, data: { reference } })
  })

  // Only accept existing private objects uploaded for this account.
  app.post('/me/kyc', { preHandler: authenticate }, async (request, reply) => {
    const { documentType, documentUrl, selfieUrl } = kycSchema.parse(request.body)

    await validateOwnedKycImage(documentUrl, request.user.userId)
    if (selfieUrl) await validateOwnedKycImage(selfieUrl, request.user.userId)

    await prisma.$transaction(async tx => {
      await tx.kYCRecord.create({
        data: {
          userId: request.user.userId,
          documentType,
          documentUrl,
          selfieUrl: selfieUrl || null,
          status: 'PENDING',
        },
      })

      await tx.user.update({
        where: { id: request.user.userId },
        data: { kycStatus: 'PENDING' },
      })
    })

    return reply.status(201).send({ success: true, message: 'KYC documents submitted for review' })
  })

  app.get('/me/referrals', { preHandler: authenticate }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: {
        referralCode: true,
        referrals: {
          select: {
            id: true, email: true, firstName: true, createdAt: true,
            wallet: { select: { totalDeposited: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    return reply.send({ success: true, data: user })
  })
}
