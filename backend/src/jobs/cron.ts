import cron from 'node-cron'
import { prisma } from '../server'
import { settleDraw } from '../services/drawSettlement'

export async function processDueDraws() {
  const now = new Date()
  const draws = await prisma.draw.findMany({
    where: { status: { in: ['SCHEDULED', 'IN_PROGRESS'] }, scheduledAt: { lte: now } },
    select: { id: true }, orderBy: { scheduledAt: 'asc' }, take: 100,
  })
  for (const draw of draws) {
    try {
      await settleDraw(draw.id)
    } catch (error) {
      console.error(`[Draw Settlement] Draw ${draw.id} failed; it remains available for recovery:`, error)
    }
  }
}

export function initCronJobs() {
  const run = () => processDueDraws().catch(error => console.error('[Draw Settlement] Scheduler failed:', error))
  // Recover overdue/interrupted draws on startup as well as every minute.
  void run()
  return cron.schedule('* * * * *', run, { noOverlap: true })
}
