import Queue from 'bull';
import { PrismaClient } from '@prisma/client';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const prisma = new PrismaClient();

// Bull parses redis URLs itself and drops the rediss: protocol. Pass TLS
// explicitly so its producer, subscriber, and blocking clients all use it.
export const supportQueue = new Queue('support', redisUrl, {
  redis: {
    ...(redisUrl.startsWith('rediss:') ? { tls: {} } : {}),
    maxRetriesPerRequest: 3,
  },
});

supportQueue.on('error', (err: Error) => {
  console.error('[Support Queue] Redis connection error:', err.message);
});

supportQueue.process(async (job: any) => {
  const { type, data } = job.data;
  
  if (type === 'AUTO_ASSIGN') {
    const { ticketId, departmentId } = data;
    // Find an agent with the least assigned tickets in the department
    const agents = await prisma.supportAgent.findMany({
      where: { 
        departmentId,
        status: 'ONLINE' 
      },
      include: {
        _count: {
          select: { assignedTickets: { where: { status: 'OPEN' } } }
        }
      },
      orderBy: {
        assignedTickets: {
          _count: 'asc'
        }
      },
      take: 1
    });

    if (agents.length > 0) {
      const bestAgent = agents[0];
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { assignedToId: bestAgent.id, status: 'ASSIGNED' }
      });
      await prisma.ticketAssignment.create({
        data: {
          ticketId,
          agentId: bestAgent.id,
          assignedBy: 'SYSTEM'
        }
      });
    }
  }

  if (type === 'CHECK_SLA') {
    const tickets = await prisma.supportTicket.findMany({
      where: { 
        status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] },
        slaDeadline: { lt: new Date() } 
      }
    });

    for (const ticket of tickets) {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { status: 'ESCALATED' }
      });
      
      // Notify managers or team leads
      // This is a placeholder for notification logic
      await prisma.notification.create({
        data: {
          userId: ticket.userId || '',
          title: 'SLA Breached',
          message: `Ticket ${ticket.ticketNumber} has breached SLA.`,
        }
      });
    }
  }
}).catch((err: Error) => {
  console.error('[Support Queue] Worker initialization failed:', err.message);
});

supportQueue.on('completed', (job: any) => {
  console.log(`Job ${job.id} has completed!`);
});

supportQueue.on('failed', (job: any, err: any) => {
  console.error(`Job ${job.id} has failed with ${err.message}`);
});

// Retry scheduling after a Redis outage. A rejected background add must never
// become an unhandled rejection that terminates the entire API process.
async function scheduleSlaCheck() {
  try {
    await supportQueue.add({ type: 'CHECK_SLA', data: {} }, { repeat: { cron: '*/5 * * * *' } });
  } catch (err) {
    console.error('[Support Queue] SLA scheduling failed; retrying in 30 seconds:', (err as Error).message);
    setTimeout(scheduleSlaCheck, 30_000).unref();
  }
}
void scheduleSlaCheck();
