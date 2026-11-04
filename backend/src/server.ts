/**
 * Lucky Lotto Play Platform - Fastify Backend Server
 * Production-ready lottery platform API
 */

import * as dotenv from 'dotenv'
dotenv.config()

import Fastify from 'fastify'
import type { FastifyError } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import websocket from '@fastify/websocket'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'
import crypto from 'crypto'
import rawBody from 'fastify-raw-body'

// Route imports
import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import walletRoutes from './routes/wallet'
import gameRoutes from './routes/games'
import ticketRoutes from './routes/tickets'
import drawRoutes from './routes/draws'
import adminRoutes from './routes/admin'
import affiliateRoutes from './routes/affiliates'
import notificationRoutes from './routes/notifications'
import supportRoutes from './routes/support'
import publicCmsRoutes from './routes/publicCms'
import reportRoutes from './routes/reports'
import paymentRoutes from './routes/payments'
import settingsRoutes from './routes/settings'
import rbacRoutes from './routes/rbac'

import { initCronJobs } from './jobs/cron'

// Initialize Prisma
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

// Initialize Redis
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
})

redis.on('error', (err) => {
  console.error('[Redis Error]', err.message || err)
})

// Build Fastify app
async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: { colorize: true }
      } : undefined,
    },
    // Explicit proxy IP/CIDR allowlist; direct callers cannot spoof their IP.
    trustProxy: process.env.TRUSTED_PROXIES
      ? process.env.TRUSTED_PROXIES.split(',').map(value => value.trim()).filter(Boolean)
      : false,
    // LOW-05: Prevent large-payload DoS on all JSON routes
    bodyLimit: 1_048_576, // 1 MB
  })

  // ── Security plugins ──────────────────────────────────
  await app.register(helmet, {
    // MED-02: Enable Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://api.stripe.com', 'https://www.paypal.com'],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })

  // Support both direct route access and /api/* prefixed access seamlessly
  app.addHook('onRequest', async (req) => {
    if (req.raw.url) {
      if (req.raw.url === '/api') {
        req.raw.url = '/'
      } else if (req.raw.url.startsWith('/api/')) {
        req.raw.url = req.raw.url.slice(4)
      }
    }
  })

  // CRIT-06: Strict CORS — never reflect all origins in production
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGINS || 'https://luckylottoplay.live,https://www.luckylottoplay.live,https://lottery-frontend-x3id.onrender.com').split(',')
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000']

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true)
      } else {
        cb(new Error('Not allowed by CORS'), false)
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Refresh-Token'],
  })

  await app.register(rateLimit, {
    global: true,
    max: process.env.NODE_ENV !== 'production' ? 10000 : 100,
    timeWindow: '1 minute',
    redis,
    skipOnError: false,
    keyGenerator: (req) => req.ip,
  })

  // ── JWT ───────────────────────────────────────────────
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'fallback_secret_must_be_32_chars!',
    sign: { expiresIn: '15m' },
  })

  // ── File upload ───────────────────────────────────────
  await app.register(rawBody, { global: false, encoding: false, runFirst: true })
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  })

  // ── WebSockets ────────────────────────────────────────
  await app.register(websocket)

  // ── API Documentation ────────────────────────────────
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Lucky Lotto Play API',
        description: 'Production-ready global Lottery Platform API',
        version: '1.0.0',
      },
      tags: [
        { name: 'auth', description: 'Authentication endpoints' },
        { name: 'games', description: 'Lottery games' },
        { name: 'tickets', description: 'Ticket management' },
        { name: 'wallet', description: 'Wallet & transactions' },
        { name: 'admin', description: 'Administration' },
      ],
    },
  })

  // MED-03: Only expose Swagger UI in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list' },
    })
  }

  // ── Decorate with shared clients ──────────────────────
  app.decorate('prisma', prisma)
  app.decorate('redis', redis)

  // ── Health check ──────────────────────────────────────────
  // MED-03: Never return internal error details (connection strings, hostnames, etc.) publicly
  app.get('/health', async (request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      await redis.ping()
      return { status: 'healthy', timestamp: new Date().toISOString() }
    } catch (err) {
      request.log.error(err, 'Health check failed') // log internally only
      return reply.status(503).send({ status: 'degraded', timestamp: new Date().toISOString() })
    }
  })

  // ── Routes ────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(userRoutes, { prefix: '/users' })
  await app.register(walletRoutes, { prefix: '/wallet' })
  await app.register(gameRoutes, { prefix: '/games' })
  await app.register(ticketRoutes, { prefix: '/tickets' })
  await app.register(drawRoutes, { prefix: '/draws' })
  await app.register(adminRoutes, { prefix: '/admin' })
  await app.register(affiliateRoutes, { prefix: '/affiliates' })
  await app.register(notificationRoutes, { prefix: '/notifications' })
  await app.register(supportRoutes, { prefix: '/support' })
  await app.register(publicCmsRoutes, { prefix: '/cms' })
  await app.register(reportRoutes, { prefix: '/reports' })
  await app.register(paymentRoutes, { prefix: '/payments' })
  await app.register(settingsRoutes, { prefix: '/settings' })
  await app.register(rbacRoutes, { prefix: '/rbac' })

  // ── Global error handler ──────────────────────────────
  app.setErrorHandler<FastifyError>(async (error, request, reply) => {
    request.log.error({ err: error, url: request.url, method: request.method })

    if (error.validation || error.name === 'ZodError' || (error as any).issues) {
      return reply.status(400).send({
        success: false,
        error: 'Validation Error',
        details: error.validation || (error as any).issues,
      })
    }

    if (error.statusCode === 429) {
      return reply.status(429).send({
        success: false,
        error: 'Too many requests. Please try again later.',
      })
    }

    const statusCode = error.statusCode || 500
    return reply.status(statusCode).send({
      success: false,
      error: statusCode === 500 ? 'Internal server error' : error.message,
    })
  })

  return app
}

async function seedPermissionsIfNeeded() {
  try {
    const count = await prisma.permission.count()
    if (count < 231) {
      const MODULES = [
        'Dashboard', 'Reports', 'Users', 'KYC', 'Wallets', 'Deposits', 'Withdrawals', 
        'Games', 'Draws', 'Results', 'Jackpots', 'Affiliates', 'CMS', 'Promotions', 
        'Support', 'Audit Logs', 'Analytics', 'Notifications', 'Settings', 'API Keys', 'Backups'
      ]
      const ACTIONS = [
        'View', 'Create', 'Edit', 'Delete', 'Approve', 'Reject', 'Export', 'Import', 'Manage', 'Assign', 'Configure'
      ]
      
      const permissionsToCreate = []
      for (const module of MODULES) {
        for (const action of ACTIONS) {
          permissionsToCreate.push({
            id: crypto.randomUUID(),
            module,
            action,
            description: `Allows ${action} on ${module}`
          })
        }
      }

      await prisma.permission.createMany({
        data: permissionsToCreate,
        skipDuplicates: true
      })
      console.log(`[Startup] Checked and seeded missing system permissions.`)
    }
  } catch (error) {
    console.error('[Startup] Failed to auto-seed permissions:', error)
  }
}

// HIGH-03: Detect weak or default JWT secrets before accepting traffic
function checkSecretStrength() {
  const KNOWN_WEAK_SECRETS = [
    'your-super-secret-jwt-key',
    'fallback_secret_must_be_32_chars!',
    'your_jwt_secret_min_32_chars',
    'your_refresh_secret_min_32_chars',
    'secret',
    'jwt_secret',
    '',
  ]
  const jwtSecret = process.env.JWT_SECRET || ''
  const isWeak = KNOWN_WEAK_SECRETS.includes(jwtSecret) || jwtSecret.length < 32

  if (isWeak) {
    const msg = `
╔══════════════════════════════════════════════════════════════╗
║  ⚠️  CRITICAL SECURITY WARNING                                ║
║  JWT_SECRET is weak, default, or missing!                    ║
║  This allows attackers to forge admin tokens.                ║
║  Generate a strong secret:                                   ║
║  node -e "require('crypto').randomBytes(64).toString('hex')" ║
║  Then set JWT_SECRET in your environment variables.          ║
╚══════════════════════════════════════════════════════════════╝`
    console.error(msg)
    // HIGH-06: Refuse to start with a weak secret in ANY environment.
    // Development DBs often contain partial production data and weak
    // secrets are trivially exploitable when the source is public.
    console.error('[FATAL] Refusing to start with weak or missing JWT_SECRET.')
    process.exit(1)
  }
}

// H-2: Refuse to start in production if ALLOWED_ORIGINS is misconfigured or wildcard
function checkCORSOrigins() {
  if (process.env.NODE_ENV === 'production') {
    const origins = process.env.ALLOWED_ORIGINS || 'https://luckylottoplay.live,https://www.luckylottoplay.live,https://lottery-frontend-x3id.onrender.com'
    if (!origins || origins.trim() === '' || origins.includes('*')) {
      console.error('[FATAL] Refusing to start in production with weak, missing, or wildcard ALLOWED_ORIGINS.')
      process.exit(1)
    }
  }
}

// Start server
async function start() {
  checkSecretStrength()
  checkCORSOrigins()
  if (process.env.NODE_ENV === 'production' && !process.env.RESEND_API_KEY &&
      !(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) &&
      process.env.ALLOW_MOCK_EMAIL !== 'true') {
    throw new Error('Production requires configured email delivery credentials (or set ALLOW_MOCK_EMAIL=true for initial deployment testing)')
  }

  const app = await buildApp()
  const port = Number(process.env.PORT) || 3001
  const host = process.env.HOST || '0.0.0.0'

  try {
    await redis.connect()
    await seedPermissionsIfNeeded()
    await app.listen({ port, host })
    app.log.info(`🚀 Server running on http://${host}:${port}`)
    app.log.info(`📚 API docs: http://${host}:${port}/docs`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  // ── Initialize Background Jobs ──────────────────────
  if (process.env.NODE_ENV !== 'test') {
    initCronJobs()
  }

  // Graceful shutdown
  const signals = ['SIGTERM', 'SIGINT']
  signals.forEach((signal) => {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`)
      await app.close()
      await prisma.$disconnect()
      await redis.quit()
      process.exit(0)
    })
  })
}

start()
