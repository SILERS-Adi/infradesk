import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import prisma from '../lib/prisma';

export const agentConnections = new Map<string, WebSocket>();

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
    const url = new URL(req.url ?? '', 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) { ws.close(1008, 'Token required'); return; }

    const reg = await prisma.agentRegistration.findUnique({ where: { agentToken: token } });
    if (!reg) { ws.close(1008, 'Invalid token'); return; }

    agentConnections.set(token, ws);
    console.log(`Agent connected: ${reg.hostname ?? token.slice(0, 8)}`);

    // Update lastSeen on connect
    await prisma.agentRegistration.update({
      where: { agentToken: token },
      data: { lastSeen: new Date() },
    });

    // Periodic lastSeen update (every 60s while connected)
    const heartbeatInterval = setInterval(async () => {
      if (ws.readyState === WebSocket.OPEN) {
        await prisma.agentRegistration.update({
          where: { agentToken: token },
          data: { lastSeen: new Date() },
        }).catch(() => {});
      }
    }, 60_000);

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

export function broadcastToAll(payload: object) {
  const msg = JSON.stringify(payload);
  agentConnections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}
