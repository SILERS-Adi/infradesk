/**
 * Secure Remote Command Framework
 *
 * Request-response pattern over WebSocket:
 * 1. Panel sends command to agent (via WS)
 * 2. Agent executes and responds with result
 * 3. Backend returns result to panel (via HTTP)
 *
 * Security:
 * - Whitelisted commands only (no arbitrary execution)
 * - Every command logged to audit trail
 * - Timeout (30s default)
 * - User must be OWNER/ADMIN to send commands
 */

import { agentConnections } from './websocket';
import { WebSocket } from 'ws';
import prisma from '../lib/prisma';
import { logActivity } from './activityLogger';

// ── Whitelisted Commands ──────────────────────────────────────

export const ALLOWED_COMMANDS = new Set([
  'scan_databases',
  'test_db_connection',
  'scan_system',
  'get_services',
  'restart_service',
  'windows_update_scan',
  'windows_update_install',
  'get_event_logs',
  'system_reboot',
  'backup_run',
]);

// ── Pending Requests Map ──────────────────────────────────────

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const pendingRequests = new Map<string, PendingRequest>();

// ── Handle Agent Response ─────────────────────────────────────

export function handleAgentResponse(token: string, message: any) {
  const requestId = message.requestId;
  if (!requestId) return false;

  const pending = pendingRequests.get(requestId);
  if (!pending) return false;

  clearTimeout(pending.timeout);
  pendingRequests.delete(requestId);

  if (message.error) {
    pending.reject(new Error(message.error));
  } else {
    pending.resolve(message.data ?? message.result ?? {});
  }
  return true;
}

// ── Send Command to Agent ─────────────────────────────────────

export async function sendCommand(params: {
  agentToken: string;
  command: string;
  payload?: Record<string, any>;
  timeoutMs?: number;
  userId: string;
  workspaceId?: string;
}): Promise<any> {
  const { agentToken, command, payload = {}, timeoutMs = 30000, userId, workspaceId } = params;

  // 1. Whitelist check
  if (!ALLOWED_COMMANDS.has(command)) {
    throw new Error(`Command '${command}' is not allowed`);
  }

  // 2. Check agent is connected
  const ws = agentConnections.get(agentToken);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error('Agent is not connected');
  }

  // 3. Verify agent exists
  const agent = await prisma.agentRegistration.findUnique({
    where: { agentToken },
    select: { id: true, hostname: true, workspaceId: true },
  });
  if (!agent) throw new Error('Agent not found');

  // 4. Generate unique request ID
  const requestId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 5. Audit log
  await logActivity(prisma, {
    entityType: 'Agent',
    entityId: agent.id,
    actionType: 'REMOTE_COMMAND',
    description: `Remote command: ${command} → ${agent.hostname}`,
    performedByUserId: userId,
    workspaceId: workspaceId ?? agent.workspaceId ?? undefined,
    metadata: { command, payload: Object.keys(payload), requestId },
  });

  // 6. Send command with request ID
  ws.send(JSON.stringify({
    type: 'remote_command',
    requestId,
    command,
    payload,
  }));

  // 7. Wait for response (promise with timeout)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    pendingRequests.set(requestId, { resolve, reject, timeout });
  });
}
