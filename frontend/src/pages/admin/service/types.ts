export type InspectionType = 'PERIODIC' | 'TECHNICAL' | 'GAS_INSTALLATION' | 'ADR' | 'TAXI' | 'OTHER';
export type InspectionStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type InspectionResult = 'POSITIVE' | 'NEGATIVE' | 'CONDITIONAL';
export type BadgeColor = 'gray' | 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'indigo' | 'purple';

export interface Vehicle {
  id: string; plate: string; vin?: string; brand: string; model: string; year?: number;
  ownerName: string; ownerPhone?: string; ownerEmail?: string; notes?: string;
  createdAt: string; _count?: { inspections: number };
}

export interface Inspection {
  id: string; inspectionNumber: string; type: InspectionType; status: InspectionStatus;
  result?: InspectionResult; scheduledAt: string; completedAt?: string;
  technicianName?: string; notes?: string; mileage?: number;
  vehicle?: { id: string; plate: string; brand: string; model: string; ownerName: string };
}
