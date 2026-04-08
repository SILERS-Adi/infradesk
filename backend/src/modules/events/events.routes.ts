/**
 * Server-Sent Events (SSE) endpoint for real-time UI updates.
 * Replaces sidebar polling (30s interval) with push notifications.
 *
 * Clients: GET /api/events/stream
 * Events: ticketQueueCount, activeTasksCount, notification
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireWorkspace, withWorkspaceMembership } from '../../middleware/workspace';
import prisma from '../../lib/prisma';

const router = Router();

// Connected SSE clients (userId → Response[])
const sseClients = new Map<string, Set<Response>>();

router.get('/stream', authenticate, requireWorkspace, withWorkspaceMembership, (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const workspaceId = req.workspaceId!;

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ userId, workspaceId })}\n\n`);

  // Register client
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId)!.add(res);

  // Send initial counts
  sendBadgeCounts(res, workspaceId, req.membership);

  // Periodic badge update (every 30s as heartbeat + data refresh)
  const interval = setInterval(() => {
    sendBadgeCounts(res, workspaceId, req.membership);
  }, 30_000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(interval);
    sseClients.get(userId)?.delete(res);
    if (sseClients.get(userId)?.size === 0) sseClients.delete(userId);
  });
});

/** Send badge counts to a single SSE client */
async function sendBadgeCounts(res: Response, workspaceId: string, membership: any) {
  try {
    const [ticketQueue, activeTasks] = await Promise.all([
      prisma.ticket.count({
        where: {
          workspaceId,
          status: { in: ['NEW', 'PENDING'] },
          deletedAt: null,
        },
      }),
      prisma.task.count({
        where: {
          workspaceId,
          status: { in: ['NEW', 'IN_PROGRESS'] },
          ...(membership?.role === 'TECHNICIAN' ? { assignedToUserId: membership.userId } : {}),
        },
      }),
    ]);

    res.write(`event: badges\ndata: ${JSON.stringify({ ticketQueue, activeTasks })}\n\n`);
  } catch {
    // Connection may be closed — silent
  }
}

/** Push event to a specific user (called from other modules) */
export function pushToUser(userId: string, event: string, data: any) {
  const clients = sseClients.get(userId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

/** Push event to all users in a workspace */
export function pushToWorkspace(workspaceId: string, event: string, data: any) {
  // This requires iterating all clients — for now, broadcast to all connected
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, clients] of sseClients) {
    for (const res of clients) {
      try { res.write(payload); } catch { clients.delete(res); }
    }
  }
}

/** Get count of connected SSE clients */
export function getConnectedClientsCount(): number {
  let count = 0;
  for (const [, clients] of sseClients) count += clients.size;
  return count;
}

export default router;
