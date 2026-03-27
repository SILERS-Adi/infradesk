import api from './client';

export interface TimeEntry {
  id: string;
  workSessionId: string;
  startedAt: string;
  endedAt?: string | null;
  durationMin?: number | null;
  notes?: string | null;
}

export interface WorkSession {
  id: string;
  clientId: string;
  deviceId?: string;
  agentRegId?: string;
  techId: string;
  ticketId?: string;
  locationId?: string;
  status?: string;
  startedAt: string;
  endedAt?: string;
  pausedAt?: string;
  durationMin?: number;
  totalPausedMin?: number;
  notes?: string;
  client?: { id: string; name: string; hasContract?: boolean; contractHours?: number; contractMonthlyValue?: number; hourlyRate?: number; contractHourlyRateOverLimit?: number; billingIntervalMinutes?: number } | null;
  device?: { id: string; name: string } | null;
  ticket?: { id: string; ticketNumber: string; title: string } | null;
  location?: { id: string; name: string } | null;
  timeEntries?: TimeEntry[];
}

/** Oblicz sumaryczny czas pracy (sekundy) z time entries */
export function calcWorkSeconds(entries: TimeEntry[]): number {
  let totalMs = 0;
  for (const e of entries) {
    const end = e.endedAt ? new Date(e.endedAt).getTime() : Date.now();
    totalMs += end - new Date(e.startedAt).getTime();
  }
  return Math.max(0, Math.floor(totalMs / 1000));
}

interface SessionListResponse {
  data: WorkSession[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export const sessionsApi = {
  getAll: async (params?: { techId?: string; clientId?: string; from?: string; to?: string }): Promise<WorkSession[]> => {
    const { data } = await api.get<SessionListResponse>('/sessions', { params: { ...params, limit: 200 } });
    return data.data;
  },

  start: (agentRegId: string): Promise<WorkSession> =>
    api.post('/sessions', { agentRegId }).then(r => r.data),

  end: (id: string, notes?: string): Promise<WorkSession> =>
    api.patch(`/sessions/${id}/end`, { notes }).then(r => r.data),

  getByClient: (clientId: string): Promise<WorkSession[]> =>
    api.get(`/sessions/client/${clientId}`).then(r => r.data),

  startMobile: (data: { clientId: string; ticketId?: string; locationId?: string; deviceId?: string }) =>
    api.post('/sessions/mobile', data).then(r => r.data),

  pause: (id: string) =>
    api.patch(`/sessions/${id}/pause`).then(r => r.data),

  resume: (id: string) =>
    api.patch(`/sessions/${id}/resume`).then(r => r.data),

  getActive: (): Promise<WorkSession[]> =>
    api.get('/sessions/active').then(r => Array.isArray(r.data) ? r.data : r.data ? [r.data] : []),

  updateSession: (id: string, data: { startedAt?: string; endedAt?: string; durationMin?: number; notes?: string }): Promise<WorkSession> =>
    api.patch(`/sessions/${id}`, data).then(r => r.data),

  deleteSession: (id: string): Promise<void> =>
    api.delete(`/sessions/${id}`).then(() => undefined),
};
