import apiClient from './client';

export interface VoiceParsed {
  clientName?: string | null;
  type?: 'SERVICE' | 'ORDER' | 'DELEGATION' | 'OTHER' | null;
  title?: string | null;
  description?: string | null;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  assigneeName?: string | null;
}

export const aiApi = {
  parseVoice: async (transcript: string): Promise<VoiceParsed> => {
    const { data } = await apiClient.post<VoiceParsed>('/ai/voice-parse', { transcript });
    return data;
  },
};
