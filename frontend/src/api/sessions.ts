import api from './client';

export interface WorkSession {
  id: string;
  clientId: string;
  deviceId?: string;
  agentRegId?: string;
  techId: string;
  startedAt: string;
  endedAt?: string;
  durationMin?: number;
  notes?: string;
  client?: { id: string; name: string } | null;
  device?: { id: string; name: string } | null;
}

export const sessionsApi = {
  start: (agentRegId: string): Promise<WorkSession> =>
    api.post('/sessions', { agentRegId }).then(r => r.data),

  end: (id: string, notes?: string): Promise<WorkSession> =>
    api.patch(`/sessions/${id}/end`, { notes }).then(r => r.data),

  getByClient: (clientId: string): Promise<WorkSession[]> =>
    api.get(`/sessions/client/${clientId}`).then(r => r.data),
};
