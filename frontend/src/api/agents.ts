import api from './client';

export interface InstalledSoftware {
  name: string;
  version?: string;
  publisher?: string;
}

export interface DiskInfo {
  device: string;
  mountpoint: string;
  fstype: string;
  totalGb: number;
  freeGb: number;
  usedPct: number;
}

export interface NetworkIface {
  name: string;
  ip: string;
  mac: string;
  isUp: boolean;
}

export interface AgentRegistration {
  id: string;
  agentToken: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED';
  nip?: string;
  clientId?: string;
  deviceId?: string;
  // Sieć / system
  hostname?: string;
  ipAddress?: string;
  osInfo?: string;
  windowsVersion?: string;
  domain?: string;
  currentUser?: string;
  serialNumber?: string;
  lastBootTime?: string;
  // Dane rejestracyjne
  companyName?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactPhone?: string;
  contactEmail?: string;
  registrationNotes?: string;
  allowRustdesk?: boolean;
  allowMonitoring?: boolean;
  // Sprzęt
  cpuModel?: string;
  cpuCores?: number;
  cpuThreads?: number;
  ramTotalGb?: number;
  gpuModel?: string;
  motherboard?: string;
  rustdeskId?: string;
  anydeskId?: string;
  teamviewerId?: string;
  // Metryki bieżące
  cpuUsage?: number;
  ramUsage?: number;
  diskFree?: number;
  diskTotal?: number;
  cpuTempC?: number;
  // JSON
  diskInfo?: DiskInfo[];
  networkIfaces?: NetworkIface[];
  installedSoftware?: InstalledSoftware[];
  appVersion?: string;
  lastSeen?: string;
  createdAt: string;
  client?: { id: string; name: string } | null;
  device?: { id: string; name: string } | null;
}

export const agentsApi = {
  getAll: (): Promise<AgentRegistration[]> =>
    api.get('/agent').then(r => r.data),

  approve: (id: string, clientId?: string, deviceId?: string): Promise<AgentRegistration> =>
    api.post(`/agent/${id}/approve`, { clientId, deviceId }).then(r => r.data),

  approveNewClient: (id: string, clientData: {
    name: string; taxId?: string; phone?: string; email?: string;
    addressLine1?: string; postalCode?: string; city?: string;
  }): Promise<AgentRegistration> =>
    api.post(`/agent/${id}/approve-new-client`, clientData).then(r => r.data),

  pushUpdate: (id: string): Promise<void> =>
    api.post(`/agent/${id}/push-update`).then(() => undefined),

  windowsUpdate: (id: string, scheduleTime?: string): Promise<void> =>
    api.post(`/agent/${id}/windows-update`, { scheduleTime }).then(() => undefined),

  wake: (id: string): Promise<void> =>
    api.post(`/agent/${id}/wake`).then(() => undefined),

  restartService: (id: string, serviceName: string): Promise<void> =>
    api.post(`/agent/${id}/restart-service`, { serviceName }).then(() => undefined),

  systemReboot: (id: string, delay?: number): Promise<void> =>
    api.post(`/agent/${id}/system-reboot`, { delay: delay ?? 60 }).then(() => undefined),

  delete: (id: string): Promise<void> =>
    api.delete(`/agent/${id}`).then(() => undefined),
};
