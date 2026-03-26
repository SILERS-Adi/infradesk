import api from './client';

export interface GeofenceEvent {
  location: { id: string; name: string; clientId: string; clientName?: string };
  tickets: { id: string; ticketNumber: string; title: string; status: string; priority: string }[];
}

export interface PositionResponse {
  nearLocations: { id: string; name: string; clientId: string; clientName?: string }[];
  entered: GeofenceEvent[];
  exited: GeofenceEvent[];
}

export interface NearbyTicket {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  distance: number | null;
  client?: { id: string; name: string };
  location?: { id: string; name: string };
  assignedTo?: { id: string; firstName: string; lastName: string } | null;
}

export const geolocationApi = {
  updatePosition: (latitude: number, longitude: number, accuracy?: number): Promise<PositionResponse> =>
    api.post('/geolocation/position', { latitude, longitude, accuracy }).then(r => r.data),

  getNearbyTickets: (lat: number, lng: number, radius?: number): Promise<NearbyTicket[]> =>
    api.get('/geolocation/nearby-tickets', { params: { lat, lng, radius } }).then(r => r.data),
};
