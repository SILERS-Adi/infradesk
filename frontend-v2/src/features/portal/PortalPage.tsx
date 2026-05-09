// Portal klienta — backend RLS ogranicza tickety do createdBy/requesterEmail = me.

import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, MessageSquare, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { StatusPill } from '@/components/ui/StatusPill';
import { PriorityDot } from '@/components/ui/PriorityDot';
import { formatDatePl, formatRelativePl } from '@/lib/utils';

interface PortalTicket {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  assignedTo: { firstName: string; lastName: string } | null;
}

interface MeResp {
  user: { id: string; firstName: string; lastName: string; email: string };
}

export function PortalPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery<MeResp>({
    queryKey: ['users', 'me'],
    queryFn: async () => (await api.get('/users/me')).data,
    staleTime: 60_000,
  });

  // Portal jest tylko dla klientów. MSP/INTERNAL_IT trafiają na /dashboard.
  const { data: ws, isLoading: wsLoading } = useQuery<{ workspace: { type: 'MSP' | 'CLIENT' | 'INTERNAL_IT' } | null }>({
    queryKey: ['workspaces', 'current'],
    queryFn: async () => (await api.get('/workspaces/current')).data,
    staleTime: 5 * 60_000,
  });
  if (!wsLoading && ws?.workspace && ws.workspace.type !== 'CLIENT') {
    return <Navigate to="/dashboard" replace />;
  }

  const { data, isLoading } = useQuery<{ items: PortalTicket[] }>({
    queryKey: ['portal', 'tickets', me?.user?.id ?? null],
    queryFn: async () => (await api.get('/tickets', { params: { limit: 50 } })).data,
    enabled: !!me?.user?.id,
  });
  const myTickets = data?.items ?? [];

  const open = myTickets.filter((t) => !['CLOSED', 'CANCELLED', 'RESOLVED'].includes(t.status));
  const closed = myTickets.filter((t) => ['CLOSED', 'CANCELLED', 'RESOLVED'].includes(t.status));

  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM' });
  const create = useMutation({
    mutationFn: async () => (await api.post('/tickets', {
      title: form.title.trim(),
      description: form.description,
      priority: form.priority,
      type: 'INCIDENT',
      source: 'PORTAL',
      components: { service: { } }, // service component (no assignee — leci jako OPEN/nieprzydzielone)
    })).data,
    onSuccess: (data: { ticket?: { ticketNumber?: string } }) => {
      toast.success(`Zgłoszenie ${data.ticket?.ticketNumber ?? ''} utworzone`);
      setShowNew(false);
      setForm({ title: '', description: '', priority: 'MEDIUM' });
      qc.invalidateQueries({ queryKey: ['portal', 'tickets'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err?.response?.data?.message ?? 'Błąd tworzenia'),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-tx">Twoje zgłoszenia</h1>
          <p className="text-sm text-tx3">
            {me?.user ? `Zalogowany jako ${me.user.firstName} ${me.user.lastName}` : 'Wczytywanie...'}
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" /> Nowe zgłoszenie
        </Button>
      </div>

      {showNew && (
        <Card>
          <CardHeader><CardTitle>Nowe zgłoszenie</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1 text-tx2">Tytuł *</label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} placeholder="Krótko o co chodzi" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1 text-tx2">Opis problemu</label>
              <Textarea rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Co się dzieje, co próbowałeś, kiedy zaczął się problem" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1 text-tx2">Priorytet</label>
              <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="LOW">Niski (mogę poczekać)</option>
                <option value="MEDIUM">Średni (utrudnia pracę)</option>
                <option value="HIGH">Wysoki (blokuje pracę)</option>
                <option value="CRITICAL">Krytyczny (firma stoi)</option>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>Anuluj</Button>
              <Button
                size="sm"
                disabled={create.isPending || form.title.trim().length < 3}
                onClick={() => create.mutate()}
              >
                {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Wyślij
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-pri" />
        </div>
      )}

      {/* Statystyki */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Clock className="h-6 w-6 text-warn" />
            <div>
              <p className="text-[11px] text-tx3 uppercase tracking-wide">Otwarte</p>
              <p className="text-xl font-bold text-tx">{open.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-ok" />
            <div>
              <p className="text-[11px] text-tx3 uppercase tracking-wide">Zakończone</p>
              <p className="text-xl font-bold text-tx">{closed.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-pri" />
            <div>
              <p className="text-[11px] text-tx3 uppercase tracking-wide">Wszystkich</p>
              <p className="text-xl font-bold text-tx">{myTickets.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Lista otwartych */}
      {open.length > 0 && (
        <Card>
          <CardHeader><CardTitle>W trakcie ({open.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {open.map((t) => (
                <Link
                  key={t.id}
                  to={`/tickets/${t.id}`}
                  className="block p-3 rounded-[var(--r-s)] border border-bd hover:border-pri/50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <PriorityDot priority={t.priority} withLabel />
                    <span className="text-[11px] font-mono text-tx3">{t.ticketNumber}</span>
                    <StatusPill entity="ticket" value={t.status} />
                    <span className="text-[10px] text-tx3 ml-auto">{formatRelativePl(t.updatedAt)}</span>
                  </div>
                  <p className="text-[14px] font-medium text-tx">{t.title}</p>
                  {t.assignedTo && (
                    <p className="text-[11px] text-tx3 mt-1">
                      Obsługuje: {t.assignedTo.firstName} {t.assignedTo.lastName}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista zakończonych — collapsable */}
      {closed.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Zakończone ({closed.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {closed.slice(0, 20).map((t) => (
                <Link
                  key={t.id}
                  to={`/tickets/${t.id}`}
                  className="block p-3 rounded-[var(--r-s)] border border-bd opacity-70 hover:opacity-100 transition-opacity"
                >
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[11px] font-mono text-tx3">{t.ticketNumber}</span>
                    <StatusPill entity="ticket" value={t.status} />
                    <span className="text-[10px] text-tx3 ml-auto">{formatDatePl(t.updatedAt)}</span>
                  </div>
                  <p className="text-[13px] text-tx2 line-through-light">{t.title}</p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && myTickets.length === 0 && !showNew && (
        <Card className="p-10 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">Nie masz jeszcze żadnych zgłoszeń</p>
          <p className="text-tx3 text-[13px] mb-4">Kliknij "Nowe zgłoszenie" żeby zgłosić problem do działu IT.</p>
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" /> Nowe zgłoszenie
          </Button>
        </Card>
      )}
    </div>
  );
}

export default PortalPage;
