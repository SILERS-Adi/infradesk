// @ts-nocheck
import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, X, Sparkles, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { aiApi, type AiCommand, type CommandAction } from '../api/ai';
import { ticketsApi } from '../api/tickets';
import { tasksApi } from '../api/tasks';
import { ordersApi } from '../api/orders';
import { delegationsApi } from '../api/delegations';
import { usersApi } from '../api/users';

interface HistoryEntry {
  id: number;
  transcript: string;
  command: AiCommand;
  status: 'pending' | 'success' | 'error';
  result?: string;
}

const ACTION_LABELS: Record<CommandAction, string> = {
  CREATE_CLIENT: 'Tworzenie klienta',
  CREATE_TICKET: 'Tworzenie zgłoszenia',
  CREATE_TASK: 'Tworzenie zadania',
  CREATE_ORDER: 'Tworzenie zamówienia',
  CREATE_DELEGATION: 'Tworzenie delegacji',
  CHANGE_STATUS: 'Zmiana statusu',
  ASSIGN_TICKET: 'Przypisanie zgłoszenia',
  ADD_COMMENT: 'Dodawanie komentarza',
  SEARCH: 'Wyszukiwanie',
  UNKNOWN: 'Nierozpoznane',
};

export function VoiceAssistant() {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const recognitionRef = useRef<any>(null);
  const idRef = useRef(0);
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Prefetch users and clients for name matching
  const { data: users = [] } = useQuery({
    queryKey: ['users-voice'],
    queryFn: () => usersApi.getAll(),
    staleTime: 60_000,
    enabled: open,
  });
  const { data: clients = [] } = useQuery({
    queryKey: ['clients-voice'],
    queryFn: () => clientsApi.getAll(),
    staleTime: 60_000,
    enabled: open,
  });

  // Fuzzy match helpers
  const findClient = useCallback((name: string | null | undefined) => {
    if (!name) return null;
    const lower = name.toLowerCase();
    return clients.find(c => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())) ?? null;
  }, [clients]);

  const findUser = useCallback((name: string | null | undefined) => {
    if (!name) return null;
    const lower = name.toLowerCase();
    return users.find(u => {
      const full = `${u.firstName} ${u.lastName}`.toLowerCase();
      return full.includes(lower) || lower.includes(full) || u.firstName.toLowerCase().includes(lower) || u.lastName.toLowerCase().includes(lower);
    }) ?? null;
  }, [users]);

  // Execute parsed command
  const executeCommand = useCallback(async (cmd: AiCommand, entryId: number) => {
    const p = cmd.params;
    try {
      let result = '';
      switch (cmd.action) {
        case 'CREATE_CLIENT': {
          const created = await clientsApi.create({
            name: p.name,
            clientType: p.clientType === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'COMPANY',
            taxId: p.taxId || undefined,
            email: p.email || undefined,
            phone: p.phone || undefined,
            addressLine1: p.address || undefined,
          });
          qc.invalidateQueries({ queryKey: ['clients'] });
          result = `Utworzono klienta "${created.name}"`;
          toast.success(result);
          navigate('/clients');
          break;
        }
        case 'CREATE_TICKET': {
          const client = findClient(p.clientName);
          const assignee = findUser(p.assigneeName);
          if (!client && p.clientName) {
            result = `Nie znaleziono klienta "${p.clientName}". Utwórz klienta najpierw.`;
            toast.error(result);
            break;
          }
          const ticket = await ticketsApi.create({
            clientId: client?.id,
            title: p.title,
            description: p.description || undefined,
            priority: p.priority || 'MEDIUM',
            type: p.type || 'INCIDENT',
            source: 'INTERNAL',
            assignedToUserId: assignee?.id,
          } as any);
          qc.invalidateQueries({ queryKey: ['tickets'] });
          result = `Utworzono zgłoszenie #${(ticket as any).number || ticket.id}: "${p.title}"`;
          toast.success(result);
          navigate('/tickets');
          break;
        }
        case 'CREATE_TASK': {
          const assignee = findUser(p.assigneeName);
          if (!assignee) {
            result = p.assigneeName
              ? `Nie znaleziono technika "${p.assigneeName}". Podaj poprawne imię.`
              : 'Nie podano osoby do przypisania zadania.';
            toast.error(result);
            break;
          }
          await tasksApi.create({
            title: p.title,
            description: p.description || undefined,
            assignedToUserId: assignee.id,
            dueAt: p.dueAt || undefined,
          });
          qc.invalidateQueries({ queryKey: ['tasks'] });
          result = `Utworzono zadanie "${p.title}" dla ${assignee.firstName} ${assignee.lastName}`;
          toast.success(result);
          navigate('/tasks');
          break;
        }
        case 'CREATE_ORDER': {
          const client = findClient(p.clientName);
          if (!client) {
            result = `Nie znaleziono klienta "${p.clientName || '?'}". Utwórz klienta najpierw.`;
            toast.error(result);
            break;
          }
          const items = (p.items || []).map((i: any) => ({
            name: i.name,
            quantity: i.quantity || 1,
            addToInventory: false,
          }));
          await ordersApi.create({ clientId: client.id, items, notes: p.notes || undefined });
          qc.invalidateQueries({ queryKey: ['orders'] });
          result = `Utworzono zamówienie dla "${client.name}" (${items.length} pozycji)`;
          toast.success(result);
          navigate('/orders');
          break;
        }
        case 'CREATE_DELEGATION': {
          const client = findClient(p.clientName);
          const assignee = findUser(p.assigneeName);
          if (!client) {
            result = `Nie znaleziono klienta "${p.clientName || '?'}".`;
            toast.error(result);
            break;
          }
          await delegationsApi.create({
            clientId: client.id,
            title: p.title,
            description: p.description || undefined,
            scheduledAt: p.scheduledAt || undefined,
            assignedToUserId: assignee?.id,
          });
          qc.invalidateQueries({ queryKey: ['delegations'] });
          result = `Utworzono delegację "${p.title}" do ${client.name}`;
          toast.success(result);
          navigate('/delegations');
          break;
        }
        case 'CHANGE_STATUS': {
          const entity = p.entity as string;
          const id = p.identifier as string;
          if (entity === 'TICKET') {
            // Try to find ticket by number
            const allTickets = await ticketsApi.getAll({ search: id });
            const ticket = allTickets[0];
            if (!ticket) { result = `Nie znaleziono zgłoszenia "${id}"`; toast.error(result); break; }
            await ticketsApi.changeStatus(ticket.id, p.newStatus);
            qc.invalidateQueries({ queryKey: ['tickets'] });
            result = `Zmieniono status zgłoszenia #${(ticket as any).number || ticket.id} na ${p.newStatus}`;
            toast.success(result);
          } else if (entity === 'TASK') {
            const allTasks = await tasksApi.getAll({ all: true });
            const task = allTasks.find(t => t.title.toLowerCase().includes(id.toLowerCase()) || t.id === id);
            if (!task) { result = `Nie znaleziono zadania "${id}"`; toast.error(result); break; }
            await tasksApi.changeStatus(task.id, p.newStatus);
            qc.invalidateQueries({ queryKey: ['tasks'] });
            result = `Zmieniono status zadania "${task.title}" na ${p.newStatus}`;
            toast.success(result);
          } else if (entity === 'ORDER') {
            result = 'Zmiana statusu zamówienia przez głos - wkrótce dostępna';
            toast(result);
          }
          break;
        }
        case 'ASSIGN_TICKET': {
          const assignee = findUser(p.assigneeName);
          if (!assignee) { result = `Nie znaleziono technika "${p.assigneeName}"`; toast.error(result); break; }
          const allTickets = await ticketsApi.getAll({ search: p.identifier });
          const ticket = allTickets[0];
          if (!ticket) { result = `Nie znaleziono zgłoszenia "${p.identifier}"`; toast.error(result); break; }
          await ticketsApi.assign(ticket.id, assignee.id);
          qc.invalidateQueries({ queryKey: ['tickets'] });
          result = `Przypisano zgłoszenie #${(ticket as any).number || ticket.id} do ${assignee.firstName} ${assignee.lastName}`;
          toast.success(result);
          break;
        }
        case 'ADD_COMMENT': {
          const allTickets = await ticketsApi.getAll({ search: p.identifier });
          const ticket = allTickets[0];
          if (!ticket) { result = `Nie znaleziono zgłoszenia "${p.identifier}"`; toast.error(result); break; }
          await ticketsApi.addComment(ticket.id, p.comment, p.isInternal ?? false);
          qc.invalidateQueries({ queryKey: ['tickets'] });
          result = `Dodano komentarz do zgłoszenia #${(ticket as any).number || ticket.id}`;
          toast.success(result);
          break;
        }
        case 'SEARCH': {
          const entity = p.entity as string;
          if (entity === 'CLIENT') navigate(`/clients?search=${encodeURIComponent(p.query)}`);
          else if (entity === 'TICKET') navigate(`/tickets?search=${encodeURIComponent(p.query)}`);
          else if (entity === 'DEVICE') navigate(`/devices?search=${encodeURIComponent(p.query)}`);
          else navigate(`/tickets?search=${encodeURIComponent(p.query)}`);
          result = `Szukam: "${p.query}"`;
          break;
        }
        case 'UNKNOWN':
        default:
          result = p.message || 'Nie rozpoznano polecenia. Spróbuj ponownie.';
          toast.error(result);
      }

      setHistory(h => h.map(e => e.id === entryId ? { ...e, status: cmd.action === 'UNKNOWN' ? 'error' : 'success', result } : e));
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || 'Błąd wykonania polecenia';
      setHistory(h => h.map(e => e.id === entryId ? { ...e, status: 'error', result: msg } : e));
      toast.error(msg);
    }
  }, [clients, users, findClient, findUser, navigate, qc]);

  // Parse + execute mutation
  const commandMutation = useMutation({
    mutationFn: (text: string) => aiApi.command(text),
    onSuccess: (cmd, text) => {
      const id = ++idRef.current;
      const entry: HistoryEntry = { id, transcript: text, command: cmd, status: 'pending' };
      setHistory(h => [entry, ...h].slice(0, 20));
      executeCommand(cmd, id);
    },
    onError: () => toast.error('Błąd komunikacji z AI'),
  });

  // Speech recognition
  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error('Przeglądarka nie obsługuje rozpoznawania mowy'); return; }

    const r = new SR();
    r.lang = 'pl-PL';
    r.continuous = false;
    r.interimResults = true;

    r.onresult = (e: any) => {
      const result = Array.from(e.results as SpeechRecognitionResultList)
        .map((r: any) => r[0].transcript)
        .join('');
      setTranscript(result);

      if (e.results[e.results.length - 1].isFinal) {
        setListening(false);
        if (result.trim()) {
          commandMutation.mutate(result.trim());
        }
      }
    };

    r.onerror = () => { setListening(false); toast.error('Błąd rozpoznawania mowy'); };
    r.onend = () => setListening(false);

    recognitionRef.current = r;
    r.start();
    setListening(true);
    setTranscript('');
  }, [commandMutation]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  // Cleanup
  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  // Manual text command
  const [manualInput, setManualInput] = useState('');
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      commandMutation.mutate(manualInput.trim());
      setManualInput('');
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="voice-fab"
        title="Asystent głosowy AI"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="voice-panel">
      {/* Header */}
      <div className="voice-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles className="h-4 w-4" style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Asystent AI</span>
        </div>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 4 }}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Mic area */}
      <div className="voice-panel-mic">
        <button
          onClick={listening ? stopListening : startListening}
          disabled={commandMutation.isPending}
          className={`voice-mic-btn ${listening ? 'listening' : ''}`}
        >
          {listening ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </button>
        <p style={{ fontSize: 11, color: 'var(--td)', marginTop: 8, textAlign: 'center' }}>
          {listening ? 'Słucham... mów polecenie' : commandMutation.isPending ? 'Przetwarzam...' : 'Kliknij mikrofon i wydaj polecenie'}
        </p>
        {transcript && (
          <div className="voice-transcript">
            "{transcript}"
          </div>
        )}
        {commandMutation.isPending && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 11, color: 'var(--td)' }}>Analizuję polecenie...</span>
          </div>
        )}
      </div>

      {/* Manual input */}
      <form onSubmit={handleManualSubmit} className="voice-panel-input">
        <input
          type="text"
          value={manualInput}
          onChange={e => setManualInput(e.target.value)}
          placeholder="Lub wpisz polecenie tekstowo..."
          disabled={commandMutation.isPending}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '7px 10px', fontSize: 12, color: 'var(--tf)',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={!manualInput.trim() || commandMutation.isPending}
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '7px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            opacity: !manualInput.trim() || commandMutation.isPending ? 0.5 : 1,
          }}
        >
          Wyślij
        </button>
      </form>

      {/* History */}
      {history.length > 0 && (
        <div className="voice-panel-history">
          <button
            onClick={() => setHistoryExpanded(e => !e)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--td)', fontSize: 10, fontWeight: 600, padding: '4px 0', width: '100%', textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            Historia ({history.length})
            {historyExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {historyExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 250, overflowY: 'auto' }}>
              {history.map(entry => (
                <div key={entry.id} className="voice-history-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {entry.status === 'pending' && <Loader2 className="h-3 w-3 animate-spin" style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                    {entry.status === 'success' && <CheckCircle2 className="h-3 w-3" style={{ color: '#4ADE80', flexShrink: 0 }} />}
                    {entry.status === 'error' && <AlertCircle className="h-3 w-3" style={{ color: '#F87171', flexShrink: 0 }} />}
                    <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>
                      {ACTION_LABELS[entry.command.action]}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--tf)', margin: '2px 0 0 0', lineHeight: 1.3 }}>
                    "{entry.transcript}"
                  </p>
                  {entry.result && (
                    <p style={{ fontSize: 10, color: entry.status === 'error' ? '#F87171' : '#4ADE80', margin: '2px 0 0 0' }}>
                      {entry.result}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Help */}
      <div className="voice-panel-help">
        <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--td)', marginBottom: 4 }}>Przykłady poleceń:</p>
        <ul style={{ fontSize: 10, color: 'var(--td)', margin: 0, paddingLeft: 14, lineHeight: 1.6 }}>
          <li>"Załóż firmę Kowalski IT, NIP 1234567890"</li>
          <li>"Nowe zgłoszenie dla firmy ABC - nie działa drukarka"</li>
          <li>"Utwórz zadanie napraw serwer dla Jana"</li>
          <li>"Zmień status zgłoszenia 15 na wykonane"</li>
          <li>"Zamów 2 tonery dla firmy XYZ"</li>
          <li>"Zaplanuj delegację do firmy ABC na jutro"</li>
          <li>"Znajdź klienta Kowalski"</li>
        </ul>
      </div>
    </div>
  );
}
