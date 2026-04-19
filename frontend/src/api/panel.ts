import apiClient from './client';

export interface PanelPulse {
  score: number;
  state: 'ok' | 'warn' | 'alert';
  metrics: {
    openTickets: number;
    overdueTickets: number;
    unassignedTickets: number;
    totalDevices: number;
    invoicesOverdue: number;
    ticketsLast24h: number;
  };
  generatedAt: string;
}

export interface PanelTile {
  value: number;
  label: string;
  total?: number;
  currency?: string;
}

export interface PanelTiles {
  openTickets: PanelTile;
  devicesOnline: PanelTile;
  securityAlerts: PanelTile;
  billingDue: PanelTile | null;
}

export interface PanelActivityItem {
  id: string;
  type: string;
  action: string;
  description: string;
  at: string;
  by: string | null;
}

export const panelApi = {
  getPulse: async (): Promise<PanelPulse> => {
    const { data } = await apiClient.get<PanelPulse>('/panel/pulse');
    return data;
  },
  getTiles: async (): Promise<PanelTiles> => {
    const { data } = await apiClient.get<PanelTiles>('/panel/tiles');
    return data;
  },
  getActivity: async (limit = 12): Promise<{ items: PanelActivityItem[] }> => {
    const { data } = await apiClient.get<{ items: PanelActivityItem[] }>(
      `/panel/activity?limit=${limit}`,
    );
    return data;
  },
};
