import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import prisma from '../lib/prisma';

export const agentConnections = new Map<string, WebSocket>();
const MAX_AGENT_CONNECTIONS = parseInt(process.env.MAX_AGENT_CONNECTIONS || '500', 10);

let wss: WebSocketServer | null = null;

export function initWebSocket(server: import('http').Server) {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '';
    if (url.startsWith('/api/agent/ws')) {
      wss!.handleUpgrade(req, socket as any, head, (ws) => {
        wss!.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    // Token from Authorization header (preferred) or query param (legacy — deprecated)
    let token: string | null = null;
    let authMethod: 'header' | 'query' = 'header';
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else {
      // Legacy fallback — query param. Sunset: 2026-07-01 (remove after all agents updated)
      const LEGACY_WS_SUNSET = new Date('2026-07-01T00:00:00Z');
      if (new Date() >= LEGACY_WS_SUNSET) {
        ws.close(1008, 'Query token auth deprecated. Update your agent.');
        return;
      }
      const url = new URL(req.url ?? '', 'http://localhost');
      token = url.searchParams.get('token');
      if (token) {
        authMethod = 'query';
        console.warn(`[WS DEPRECATION] Agent using query param token (will stop working after ${LEGACY_WS_SUNSET.toISOString()})`);
      }
    }

    if (!token) { ws.close(1008, 'Token required'); return; }

    let reg = await prisma.agentRegistration.findUnique({ where: { agentToken: token } });
    // Token mismatch recovery: if WS token doesn't match (e.g. after admin merge),
    // look up by hostname from query param and re-bind token
    if (!reg) {
      const wsUrl = new URL(req.url ?? '', 'http://localhost');
      const hostname = wsUrl.searchParams.get('hostname');
      if (hostname) {
        const candidate = await prisma.agentRegistration.findFirst({
          where: { hostname, status: 'ACTIVE' },
          orderBy: { lastSeen: 'desc' },
        });
        if (candidate) {
          reg = await prisma.agentRegistration.update({
            where: { id: candidate.id },
            data: { agentToken: token },
          });
          console.log(`[WS] Token re-bound for ${hostname} (id=${reg.id.slice(0, 8)})`);
        }
      }
      if (!reg) { ws.close(1008, 'Invalid token'); return; }
    }
    // Security: only ACTIVE agents can maintain WebSocket connections
    if (reg.status !== 'ACTIVE') { ws.close(1008, 'Agent not approved'); return; }

    // Connection limit check
    if (agentConnections.size >= MAX_AGENT_CONNECTIONS) {
      console.warn(`[WS] Max connections reached (${MAX_AGENT_CONNECTIONS}), rejecting ${reg.hostname}`);
      ws.close(1013, 'Server at capacity');
      return;
    }

    agentConnections.set(token, ws);
    console.log(`[WS] Agent connected: ${reg.hostname ?? token.slice(0, 8)} (auth=${authMethod}, total=${agentConnections.size})`);

    // Update lastSeen
    await prisma.agentRegistration.update({
      where: { agentToken: token },
      data: { lastSeen: new Date() },
    });

    // Ping/pong heartbeat — detect dead connections
    let isAlive = true;
    ws.on('pong', () => { isAlive = true; });

    const heartbeatInterval = setInterval(async () => {
      if (!isAlive) {
        console.warn(`[WS] Dead connection detected: ${reg.hostname ?? token.slice(0, 8)}`);
        ws.terminate();
        return;
      }
      isAlive = false;
      ws.ping();

      // Update lastSeen in DB
      if (ws.readyState === WebSocket.OPEN) {
        await prisma.agentRegistration.update({
          where: { agentToken: token },
          data: { lastSeen: new Date() },
        }).catch(() => {});
      }
    }, 30_000); // 30s ping interval

    // Handle incoming messages from agent (responses to remote commands)
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        console.log(`[WS MSG] from ${reg.hostname}:`, JSON.stringify(msg).slice(0, 200));
        if (msg.requestId) {
          const { handleAgentResponse } = require('./remoteCommand');
          handleAgentResponse(token, msg);
        }
      } catch {}
    });

    ws.on('close', () => {
      clearInterval(heartbeatInterval);
      agentConnections.delete(token);
      console.log(`Agent disconnected: ${token.slice(0, 8)}`);
    });

    ws.on('error', () => {
      clearInterval(heartbeatInterval);
      agentConnections.delete(token);
    });

    // Send welcome
    ws.send(JSON.stringify({ type: 'connected', message: 'InfraDesk Agent connected' }));
  });

  console.log('WebSocket server initialized');
}

export function notifyAgent(token: string, payload: object) {
  const ws = agentConnections.get(token);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

// broadcastToAll removed — security risk (cross-workspace broadcast).
// Use notifyAgent(token, payload) for targeted communication.
