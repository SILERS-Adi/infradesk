import apiClient from './client';

export interface VoiceParsed {
  clientName?: string | null;
  type?: 'SERVICE' | 'ORDER' | 'DELEGATION' | 'OTHER' | null;
  title?: string | null;
  description?: string | null;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  assigneeName?: string | null;
}

export interface AiSuggestion {
  summary: string;
  steps: string[];
  canAutoFix: boolean;
  autoFixType: 'WINDOWS_UPDATE' | 'RESTART' | 'DISK_CLEANUP' | 'ANTIVIRUS_SCAN' | null;
  estimatedTime: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
}

export const aiApi = {
  parseVoice: async (transcript: string): Promise<VoiceParsed> => {
    const { data } = await apiClient.post<VoiceParsed>('/ai/voice-parse', { transcript });
    return data;
  },

  suggest: async (params: { title: string; description?: string; source?: string; deviceInfo?: string }): Promise<AiSuggestion> => {
    const { data } = await apiClient.post<AiSuggestion>('/ai/suggest', params);
    return data;
  },
};
