import { z } from 'zod';

// Helpers: akceptują null i konwertują na undefined — agent może wysłać null dla pól optional
const ns  = z.preprocess(v => v ?? undefined, z.string().optional());
const ne  = (z.preprocess(v => v ?? undefined, z.string().email().optional()) as unknown) as z.ZodOptional<z.ZodString>;
const nu  = (z.preprocess(v => v ?? undefined, z.string().uuid().optional())  as unknown) as z.ZodOptional<z.ZodString>;
const nn  = z.preprocess(v => v ?? undefined, z.number().optional());
const nb  = z.preprocess(v => v ?? undefined, z.boolean().optional());
const na  = z.preprocess(v => v ?? undefined, z.array(z.any()).optional());

const hardwareSchema = z.object({
  hostname:          ns,
  ipAddress:         ns,
  osInfo:            ns,
  windowsVersion:    ns,
  domain:            ns,
  currentUser:       ns,
  serialNumber:      ns,
  cpuModel:          ns,
  cpuCores:          nn,
  cpuThreads:        nn,
  ramTotalGb:        nn,
  gpuModel:          ns,
  motherboard:       ns,
  rustdeskId:        ns,
  lastBootTime:      ns,
  diskInfo:          na,
  networkIfaces:     na,
  installedSoftware: na,
  appVersion:        ns,
});

export const registerSchema = hardwareSchema.extend({
  // Logowanie istniejącego klienta
  email:    ne,
  password: ns,
  deviceId: nu, // UUID zapisany w config.json agenta
  // Rejestracja nowego urządzenia
  nip:                 ns,
  companyName:         ns,
  contactFirstName:    ns,
  contactLastName:     ns,
  contactPhone:        ns,
  contactEmail:        ne,
  registrationNotes:   ns,
  allowRustdesk:       nb,
  allowMonitoring:     nb,
  // Metryki
  cpuUsage:  nn,
  ramUsage:  nn,
  diskFree:  nn,
  diskTotal: nn,
  cpuTempC:  nn,
});

export const metricsSchema = z.object({
  cpuUsage:  z.number().min(0).max(100),
  ramUsage:  z.number().min(0).max(100),
  diskFree:  nn,
  diskTotal: nn,
  cpuTempC:  nn,
  hostname:       ns,
  ipAddress:      ns,
  cpuModel:       ns,
  cpuCores:       nn,
  ramTotalGb:     nn,
  windowsVersion: ns,
  currentUser:    ns,
  lastBootTime:   ns,
  rustdeskId:     ns,
  diskInfo:          na,
  networkIfaces:     na,
  installedSoftware: na,
  serverMetrics:     z.any().optional(),
});

export const agentTicketSchema = z.object({
  title:       z.string().min(1).max(200),
  description: z.string().optional(),
  priority:    z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  dueAt:       z.string().datetime({ offset: true }).optional(),
});

export const approveSchema = z.object({
  clientId: z.string().uuid().optional(), // optional: backend uses reg.clientId if omitted
  deviceId: z.string().uuid().optional(),
});

export type RegisterInput    = z.infer<typeof registerSchema>;
export type MetricsInput     = z.infer<typeof metricsSchema>;
export type AgentTicketInput = z.infer<typeof agentTicketSchema>;
export type ApproveInput     = z.infer<typeof approveSchema>;
