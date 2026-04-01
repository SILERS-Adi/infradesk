import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Building2, Key, Copy, RefreshCw, Download, Loader2 } from 'lucide-react';
import { tenantApi } from '../../api/tenant';

export default function TenantSettingsPage() {
  const queryClient = useQueryClient();
  const [confirmRegen, setConfirmRegen] = useState(false);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant-current'],
    queryFn: tenantApi.getCurrent,
  });

  const regenMutation = useMutation({
    mutationFn: tenantApi.regenerateKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-current'] });
      toast.success('Klucz został wygenerowany ponownie');
      setConfirmRegen(false);
    },
    onError: () => toast.error('Błąd generowania klucza'),
  });

  const copyKey = () => {
    if (tenant?.tenantKey) {
      navigator.clipboard.writeText(tenant.tenantKey);
      toast.success('Klucz skopiowany');
    }
  };

  const copyDownloadLink = () => {
    if (tenant?.tenantKey) {
      const link = `${window.location.origin}/api/tenant/download-agent?key=${tenant.tenantKey}`;
      navigator.clipboard.writeText(link);
      toast.success('Link skopiowany');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
      </div>
    );
  }

  if (!tenant) {
    return <div className="p-6 text-zinc-400">Brak danych tenanta</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-600/10 flex items-center justify-center">
          <Building2 className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Ustawienia panelu</h1>
          <p className="text-sm text-zinc-400">{tenant.name} · {tenant.slug}.infradesk.pl</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Użytkownicy', value: tenant._count?.users ?? 0, max: tenant.maxUsers },
          { label: 'Klienci', value: tenant._count?.clients ?? 0 },
          { label: 'Agenci', value: tenant._count?.agents ?? 0, max: tenant.maxAgents },
          { label: 'Urządzenia', value: tenant._count?.devices ?? 0 },
        ].map(s => (
          <div key={s.label} className="bg-[#060B1A] rounded-xl border border-[#1E293B] p-4">
            <p className="text-xs text-zinc-500">{s.label}</p>
            <p className="text-2xl font-bold text-white">
              {s.value}
              {s.max && <span className="text-sm text-zinc-500 font-normal"> / {s.max}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Tenant Key */}
      <div className="bg-[#060B1A] rounded-xl border border-[#1E293B] p-6">
        <div className="flex items-center gap-2 mb-3">
          <Key className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-medium text-white">Klucz powiązania agentów</h2>
        </div>
        <p className="text-xs text-zinc-500 mb-3">
          Ten klucz automatycznie łączy agentów z Twoim panelem. Udostępnij go klientom lub użyj w linku do pobrania.
        </p>
        <div className="flex items-center gap-2 mb-3">
          <code className="flex-1 px-3 py-2 bg-[#131B2E] rounded-lg text-amber-400 font-mono text-sm break-all">{tenant.tenantKey}</code>
          <button onClick={copyKey} className="p-2 hover:bg-white/5 rounded-lg transition-colors" title="Kopiuj klucz">
            <Copy className="h-4 w-4 text-zinc-400" />
          </button>
          {!confirmRegen ? (
            <button onClick={() => setConfirmRegen(true)} className="p-2 hover:bg-white/5 rounded-lg transition-colors" title="Wygeneruj nowy klucz">
              <RefreshCw className="h-4 w-4 text-zinc-400" />
            </button>
          ) : (
            <button onClick={() => regenMutation.mutate()} disabled={regenMutation.isPending} className="px-3 py-1.5 bg-red-600/20 text-red-400 rounded-lg text-xs hover:bg-red-600/30">
              {regenMutation.isPending ? 'Generuję...' : 'Potwierdź'}
            </button>
          )}
        </div>

        {/* Download link */}
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-violet-400" />
          <span className="text-xs text-zinc-500">Link do pobrania agenta:</span>
          <button onClick={copyDownloadLink} className="text-xs text-violet-400 hover:text-violet-300 underline">
            Kopiuj link
          </button>
        </div>
      </div>

      {/* Plan info */}
      <div className="bg-[#060B1A] rounded-xl border border-[#1E293B] p-6">
        <h2 className="text-sm font-medium text-white mb-2">Plan</h2>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-violet-600/20 text-violet-400 rounded-full text-sm font-medium">
            {tenant.plan}
          </span>
          <span className="text-sm text-zinc-400">
            Do {tenant.maxAgents} agentów · Do {tenant.maxUsers} użytkowników
          </span>
        </div>
      </div>
    </div>
  );
}
