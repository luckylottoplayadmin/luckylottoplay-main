import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../server'
import { auditLog } from '../middleware/auth'
import crypto from 'crypto'

const cmsPageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/i),
  content: z.string().max(200_000),
  metaTitle: z.string().max(200).optional().nullable(),
  metaDesc: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
})

const cmsBannerSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  imageUrl: z.string().min(1).max(500),
  mobileUrl: z.string().max(500).optional().nullable(),
  linkUrl: z.string().max(500).optional().nullable(),
  backgroundColor: z.string().max(50).optional().nullable(),
  position: z.string().max(50).optional(),
  isActive: z.boolean().optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

const cmsRoutes: FastifyPluginAsync = async (app) => {
  // ── Pages Management ──────────────────────────────────────────────────────

  app.get('/pages', async (request, reply) => {
    const { page = '1', limit = '20', search, status } = request.query as Record<string, string>
    const limitNum = Math.min(Math.max(1, Number(limit) || 20), 100)
    const skip = (Math.max(1, Number(page) || 1) - 1) * limitNum

    const where: any = {}
    if (status === 'PUBLISHED') where.isActive = true
    if (status === 'DRAFT') where.isActive = false
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } }
      ]
    }

    const [pages, total] = await Promise.all([
      prisma.cmsPage.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.cmsPage.count({ where })
    ])

    return reply.send({ success: true, data: pages, pagination: { page: Math.max(1, Number(page) || 1), limit: limitNum, total } })
  })

  app.post('/pages', async (request, reply) => {
    const { title, slug, content, metaTitle, metaDesc, isActive } = cmsPageSchema.parse(request.body)
    const existing = await prisma.cmsPage.findUnique({ where: { slug } })
    if (existing) return reply.status(400).send({ success: false, error: 'Slug already exists' })

    const cmsPage = await prisma.cmsPage.create({
      data: { title, slug, content, metaTitle: metaTitle ?? undefined, metaDesc: metaDesc ?? undefined, isActive }
    })
    
    await auditLog(request.user?.userId || 'system', 'PAGE_CREATE', 'CmsPage', cmsPage.id, undefined, { slug }, request)
    return reply.send({ success: true, data: cmsPage })
  })

  app.put('/pages/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { title, slug, content, metaTitle, metaDesc, isActive } = cmsPageSchema.partial().parse(request.body)
    
    if (slug) {
      const existing = await prisma.cmsPage.findUnique({ where: { slug } })
      if (existing && existing.id !== id) return reply.status(400).send({ success: false, error: 'Slug already exists on another page' })
    }

    const cmsPage = await prisma.cmsPage.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(slug !== undefined && { slug }),
        ...(content !== undefined && { content }),
        ...(metaTitle !== undefined && { metaTitle }),
        ...(metaDesc !== undefined && { metaDesc }),
        ...(isActive !== undefined && { isActive }),
      }
    })
    
    await auditLog(request.user?.userId || 'system', 'PAGE_UPDATE', 'CmsPage', id, undefined, { slug }, request)
    return reply.send({ success: true, data: cmsPage })
  })

  app.delete('/pages/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.cmsPage.delete({ where: { id } })
    await auditLog(request.user?.userId || 'system', 'PAGE_DELETE', 'CmsPage', id, undefined, undefined, request)
    return reply.send({ success: true, message: 'Page deleted' })
  })

  // ── Banner Management ─────────────────────────────────────────────────────

  app.get('/banners', async (request, reply) => {
    const { page = '1', limit = '20', search, position, status } = request.query as Record<string, string>
    const limitNum = Math.min(Math.max(1, Number(limit) || 20), 100)
    const skip = (Math.max(1, Number(page) || 1) - 1) * limitNum

    const where: any = {}
    if (position) where.position = position
    if (status === 'ACTIVE') {
      where.isActive = true
      where.OR = [
        { endDate: null },
        { endDate: { gt: new Date() } }
      ]
    }
    if (status === 'EXPIRED') {
      where.endDate = { lte: new Date() }
    }
    if (status === 'DRAFT') {
      where.isActive = false
    }
    
    if (search) {
      where.title = { contains: search, mode: 'insensitive' }
    }

    const [banners, total] = await Promise.all([
      prisma.banner.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }]
      }),
      prisma.banner.count({ where })
    ])

    return reply.send({ success: true, data: banners, pagination: { page: Math.max(1, Number(page) || 1), limit: limitNum, total } })
  })

  app.post('/banners', async (request, reply) => {
    const parsed = cmsBannerSchema.parse(request.body)
    const data: any = {
      ...parsed,
      startDate: parsed.startDate ? new Date(parsed.startDate) : null,
      endDate: parsed.endDate ? new Date(parsed.endDate) : null,
    }

    const banner = await prisma.banner.create({ data })
    await auditLog(request.user?.userId || 'system', 'BANNER_CREATE', 'Banner', banner.id, undefined, { title: banner.title }, request)
    return reply.send({ success: true, data: banner })
  })

  app.put('/banners/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = cmsBannerSchema.partial().parse(request.body)
    const data: any = { ...parsed }
    if (parsed.startDate !== undefined) data.startDate = parsed.startDate ? new Date(parsed.startDate) : null
    if (parsed.endDate !== undefined) data.endDate = parsed.endDate ? new Date(parsed.endDate) : null

    const banner = await prisma.banner.update({ where: { id }, data })
    await auditLog(request.user?.userId || 'system', 'BANNER_UPDATE', 'Banner', id, undefined, { title: banner.title }, request)
    return reply.send({ success: true, data: banner })
  })

  app.delete('/banners/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.banner.delete({ where: { id } })
    await auditLog(request.user?.userId || 'system', 'BANNER_DELETE', 'Banner', id, undefined, undefined, request)
    return reply.send({ success: true, message: 'Banner deleted' })
  })

  // ── Analytics (Mock) ──────────────────────────────────────────────────────

  app.get('/analytics', async (request, reply) => {
    const [totalPages, totalBanners, publishedPages] = await Promise.all([
      prisma.cmsPage.count(),
      prisma.banner.count(),
      prisma.cmsPage.count({ where: { isActive: true } })
    ])
    
    const trafficSources = [
      { name: 'Organic Search', value: 45 },
      { name: 'Direct', value: 30 },
      { name: 'Social Media', value: 15 },
      { name: 'Referral', value: 10 }
    ]

    const pageViews = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      return {
        date: d.toLocaleDateString('en-US', { weekday: 'short' }),
        views: crypto.randomInt(1000, 6000),
        conversions: crypto.randomInt(50, 250)
      }
    })

    return reply.send({
      success: true,
      data: {
        totalPages,
        publishedPages,
        totalBanners,
        draftPages: totalPages - publishedPages,
        trafficSources,
        pageViews,
        bannerClicks: 12450,
        averageCtr: 4.8
      }
    })
  })

}

export default cmsRoutes
