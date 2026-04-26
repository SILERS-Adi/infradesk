/**
 * WebSocket server for desktop agents (Asystent Business v4.14.6 + v5.0).
 *
 * Mount path:   /api/agent/ws?token=<agentToken>    (V1-compat URL — v4.14.6
 *               still connects here; v5 uses the same URL)
 * Auth:         Either  ?token=<agentToken>  query param  (V1 style)
 *               OR      Authorization: Bearer <agentToken>  header (v5)
 *               The token is looked up against AgentRegistration.agentToken
 *               (plaintext) with a sha256-hash fallback for future-proofing.
 *
 * Responsibilities:
 *   - Track one live WebSocket per ACTIVE agent (Map<agentId, WebSocket>).
 *   - Update lastSeen on connect + every 60s while connected.
 *   - Heartbeat ping every 30s; drop stale sockets after 2 missed pongs.
 *   - Route agent -> server "ack" messages so `sendCommand` promises resolve.
 *   - Preserve V1 message format (bare JSON, no envelope).
 *
 * PUBLIC API:
 *   initAgentWsServer(httpServer)          - call once in index.ts
 *   isAgentOnline(agentId): boolean
 *   notifyAgent(agentId, payload): boolean - fire-and-forget push
 *   sendCommandAndWait(agentId, payload, timeoutMs?) - request/response w/ ackId
 */

import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { IncomingMessage, Server as HttpServer } from 'http';
import crypto from 'crypto';
import { prismaBg as prisma } from "../../lib/prisma-bg";
import { logger } from '../../lib/logger';
import { hashToken } from '../../lib/crypto';

// ------------------------------------------------------------------
// Connection registry
// ------------------------------------------------------------------

interface AgentSocket {
  ws: WebSocket;
  agentId: string;
  agentToken: string;
  workspaceId: string;
  hostname: string | null;
  connectedAt: Date;
  lastPong: Date;
  // Pending ack waiters (requestId -> resolver/rejecter)
  pending: Map<string, PendingWaiter>;
}

interface PendingWaiter {
  resolve: (payload: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const connections = new Map<string, AgentSocket>(); // key: agentId

// ------------------------------------------------------------------
// Token lookup
// ------------------------------------------------------------------

async function lookupAgentByToken(token: string): Promise<{
  id: string;
  workspaceId: string;
  hostname: string | null;
  status: string;
  agentToken: string;
} | null> {
  if (!token) return null;
  // Try plaintext first (V1 + V2 both store plaintext in agentToken).
  let reg = await prisma.agentRegistration.findUnique({
    where: { agentToken: token },
    select: { id: true, workspaceId: true, hostname: true, status: true, agentToken: true },
  });
  if (!reg) {
    const tokenHash = hashToken(token);
    reg = await prisma.agentRegistration.findUnique({
      where: { agentTokenHash: tokenHash },
      select: { id: true, workspaceId: true, hostname: true, status: true, agentToken: true },
    });
  }
  return reg;
}

function extractToken(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    const q = url.searchParams.get('token');
    if (q) return q.trim();
  } catch { /* ignore */ }
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

// ------------------------------------------------------------------
// Connection handling
// ------------------------------------------------------------------

let wss: WebSocketServer | null = null;

function attachConnection(ws: WebSocket, reg: {
  id: string; workspaceId: string; hostname: string | null; status: string; agentToken: string;
}) {
  // Close any previous socket for this agent (reconnect wins).
  const existing = connections.get(reg.id);
  if (existing) {
    try { existing.ws.close(4000, 'Superseded by new connection'); } catch { /* ignore */ }
    // Reject all pending waiters on the old socket.
    for (const waiter of existing.pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error('Agent reconnected before response'));
    }
    connections.delete(reg.id);
  }

  const sock: AgentSocket = {
    ws,
    agentId: reg.id,
    agentToken: reg.agentToken,
    workspaceId: reg.workspaceId,
    hostname: reg.hostname,
    connectedAt: new Date(),
    lastPong: new Date(),
    pending: new Map(),
  };
  connections.set(reg.id, sock);

  logger.info({ agentId: reg.id, hostname: reg.hostname }, 'agent-ws connected');

  // Touch lastSeen immediately, then every 60s.
  prisma.agentRegistration.update({
    where: { id: reg.id },
    data: { lastSeen: new Date() },
  }).catch(() => undefined);

  const heartbeatDb = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    prisma.agentRegistration.update({
      where: { id: reg.id },
      data: { lastSeen: new Date() },
    }).catch(() => undefined);
  }, 60_000);

  // WS-level ping/pong (detect half-open TCP).
  const pingInterval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const sinceLastPong = Date.now() - sock.lastPong.getTime();
    if (sinceLastPong > 90_000) {
      logger.warn({ agentId: reg.id }, 'agent-ws pong timeout -- closing');
      try { ws.terminate(); } catch { /* ignore */ }
      return;
    }
    try { ws.ping(); } catch { /* ignore */ }
  }, 30_000);

  ws.on('pong', () => {
    sock.lastPong = new Date();
  });

  ws.on('message', (raw: RawData) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw.toString()); }
    catch { return; }
    handleAgentMessage(sock, msg);
  });

  ws.on('close', () => {
    clearInterval(heartbeatDb);
    clearInterval(pingInterval);
    // Only delete if we're still the owner (guard against late close firing after a reconnect swap).
    if (connections.get(reg.id) === sock) connections.delete(reg.id);
    for (const waiter of sock.pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error('Agent disconnected'));
    }
    sock.pending.clear();
    logger.info({ agentId: reg.id }, 'agent-ws closed');
  });

  ws.on('error', (err: Error) => {
    logger.warn({ agentId: reg.id, err: err.message }, 'agent-ws error');
  });

  // Welcome message (V1 parity)
  try {
    ws.send(JSON.stringify({ type: 'connected', message: 'InfraDesk Agent connected' }));
  } catch { /* ignore */ }
}

function handleAgentMessage(sock: AgentSocket, msg: Record<string, unknown>) {
  // Two flavours of ack are accepted:
  //   1. { requestId, data|error }   <- V1 remote_command protocol
  //   2. { type: '<orig>_ack', ackId, ok, message|data }  <- v5 push-command ack
  const requestId = (typeof msg.requestId === 'string' && msg.requestId) || null;
  const ackId = (typeof msg.ackId === 'string' && msg.ackId) || null;
  const key = requestId ?? ackId;

  if (key && sock.pending.has(key)) {
    const waiter = sock.pending.get(key)!;
    clearTimeout(waiter.timeout);
    sock.pending.delete(key);
    const err = typeof msg.error === 'string' ? msg.error : null;
    const okFlag = msg.ok;
    if (err) {
      waiter.reject(new Error(err));
    } else if (okFlag === false) {
      waiter.reject(new Error(typeof msg.message === 'string' ? msg.message : 'agent reported failure'));
    } else {
      waiter.resolve(msg);
    }
    return;
  }

  // Unsolicited message - log at debug level for future hooks.
  logger.debug({ agentId: sock.agentId, msg }, 'agent-ws unsolicited message');
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

export function isAgentOnline(agentId: string): boolean {
  const sock = connections.get(agentId);
  return !!sock && sock.ws.readyState === WebSocket.OPEN;
}

export function notifyAgent(agentId: string, payload: Record<string, unknown>): boolean {
  const sock = connections.get(agentId);
  if (!sock || sock.ws.readyState !== WebSocket.OPEN) return false;
  try { sock.ws.send(JSON.stringify(payload)); return true; }
  catch { return false; }
}

export interface SendCommandOptions {
  timeoutMs?: number;
}

/**
 * Send a command over WS and wait for an ack/response.
 *
 * The agent must echo either `requestId` or `ackId` back in its reply.  When
 * the agent replies with `{ ok:false }` or an `error` string, the promise is
 * rejected.  When the socket closes or the timeout elapses (default 30s) the
 * promise is rejected with a timeout error.
 *
 * Returns the full agent response object (minus transport wrapper).
 */
export async function sendCommandAndWait(
  agentId: string,
  payload: Record<string, unknown>,
  opts: SendCommandOptions = {},
): Promise<Record<string, unknown>> {
  const sock = connections.get(agentId);
  if (!sock || sock.ws.readyState !== WebSocket.OPEN) {
    const err = new Error('Agent is not connected');
    (err as Error & { code?: string }).code = 'AGENT_OFFLINE';
    throw err;
  }

  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      sock.pending.delete(requestId);
      const err = new Error(`Agent did not respond within ${timeoutMs}ms`);
      (err as Error & { code?: string }).code = 'AGENT_TIMEOUT';
      reject(err);
    }, timeoutMs);
    sock.pending.set(requestId, { resolve, reject, timeout });

    // We tag the outgoing payload with BOTH requestId and ackId, so both
    // request/response styles (V1 remote_command, v5 `<type>_ack`) can reply
    // successfully without negotiating versions.
    try {
      sock.ws.send(JSON.stringify({ ...payload, requestId, ackId: requestId }));
    } catch (err) {
      clearTimeout(timeout);
      sock.pending.delete(requestId);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/**
 * Find all connected agents within a workspace (for LAN-only relay operations
 * like Wake-on-LAN).  Returns agentIds of ACTIVE, online agents.
 */
export async function findRelayAgents(workspaceId: string, excludeAgentId?: string): Promise<string[]> {
  const rows = await prisma.agentRegistration.findMany({
    where: {
      workspaceId,
      status: 'ACTIVE',
      ...(excludeAgentId ? { id: { not: excludeAgentId } } : {}),
    },
    select: { id: true },
  });
  return rows.map(r => r.id).filter(id => isAgentOnline(id));
}

// ------------------------------------------------------------------
// Server bootstrap
// ------------------------------------------------------------------

export function initAgentWsServer(server: HttpServer): void {
  if (wss) {
    logger.warn('agent-ws server already initialized');
    return;
  }

  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    const url = req.url ?? '';
    if (!url.startsWith('/api/agent/ws')) {
      // Not for us - let other upgrade handlers try, or destroy.
      // (We are the only WS endpoint right now; safe to destroy.)
      socket.destroy();
      return;
    }

    const token = extractToken(req);
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    let reg;
    try {
      reg = await lookupAgentByToken(token);
    } catch (err) {
      logger.warn({ err }, 'agent-ws token lookup failed');
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
      return;
    }

    if (!reg) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Allow PENDING + ACTIVE to connect - PENDING agents keep the socket open
    // so that as soon as an admin approves them, they already have a push
    // channel ready (V1 behaviour).
    if (reg.status === 'REJECTED' || reg.status === 'INACTIVE') {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss!.handleUpgrade(req, socket as never, head, (ws) => {
      attachConnection(ws, reg!);
    });
  });

  logger.info('agent-ws server mounted at /api/agent/ws');
}
