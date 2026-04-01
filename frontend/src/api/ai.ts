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

export type CommandAction =
  | 'CREATE_CLIENT' | 'CREATE_TICKET' | 'CREATE_TASK'
  | 'CREATE_ORDER' | 'CREATE_DELEGATION'
  | 'CHANGE_STATUS' | 'ASSIGN_TICKET' | 'ADD_COMMENT'
  | 'SEARCH' | 'UNKNOWN';

export interface AiCommand {
  action: CommandAction;
  params: Record<string, any>;
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

  command: async (transcript: string): Promise<AiCommand> => {
    const { data } = await apiClient.post<AiCommand>('/ai/command', { transcript });
    return data;
  },
};
