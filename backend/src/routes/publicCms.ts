import { FastifyPluginAsync } from 'fastify'
import { prisma } from '../server'

const publicCmsRoutes: FastifyPluginAsync = async (app) => {
  // Public Endpoint to fetch active banners
  app.get('/banners', async (request, reply) => {
    const { position } = request.query as { position?: string }
    
    const where: any = {
      isActive: true,
      OR: [
        { endDate: null },
        { endDate: { gt: new Date() } }
      ]
    }
    
    if (position) {
      where.position = position
    }

    const banners = await prisma.banner.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }]
    })

    return reply.send({ success: true, data: banners })
  })

  // Public Endpoint to fetch active pages
  app.get('/pages/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const page = await prisma.cmsPage.findFirst({
      where: { slug, isActive: true }
    })
    
    if (!page) {
      return reply.status(404).send({ success: false, error: 'Page not found' })
    }

    return reply.send({ success: true, data: page })
  })

  // Only settings explicitly marked public may leave this endpoint.
  app.get('/settings', async (request, reply) => {
    const settings = await prisma.setting.findMany({ where: { isPublic: true } })
    return reply.send({ success: true, data: settings })
  })
}

export default publicCmsRoutes
