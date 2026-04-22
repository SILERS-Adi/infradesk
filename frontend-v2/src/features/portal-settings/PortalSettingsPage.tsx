import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Globe2, ExternalLink, Copy, ShieldCheck, Sparkles, Building, Mail, CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';

interface ClientRelation {
  relationId: string;
  status: string;
  client: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    email: string | null;
    plan: string;
    isActive: boolean;
  };
}

export function PortalSettingsPage() {
  const clientsQ = useQuery<{ clients: ClientRelation[] }>({
    queryKey: ['clients', 'portals'],
    queryFn: async () => (await api.get<{ clients: ClientRelation[] }>('/clients')).data,
  });

  const clients = clientsQ.data?.clients ?? [];
  const activePortals = clients.filter((c) => c.client.isActive);

  function copyLink(slug: string) {
    const url = `https://${slug}.infradesk.pl`;
    navigator.clipboard.writeText(url);
    toast.success('Link skopiowany');
  }

  return (
    <div className="space-y-[var(--sp-4)]">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight flex items-center gap-2">
          <Globe2 size={18} className="text-[var(--pri)]" /> Portal i obsługa klienta
        </h1>
        <p className="text-[13px] text-[var(--tx3)] mt-0.5">
          Każdy klient ma własną subdomenę <code>slug.infradesk.pl</code> — widzi tylko swoje dane.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--sp-3)]">
        <Card className="p-[var(--sp-4)]">
          <div className="flex items-center gap-2 text-[11px] text-[var(--tx3)] uppercase tracking-wider">
            <Building size={12} /> Aktywne portale
          </div>
          <div className="text-[28px] font-semibold mt-1 text-[var(--pri)]">{activePortals.length}</div>
        </Card>
        <Card className="p-[var(--sp-4)]">
          <div className="flex items-center gap-2 text-[11px] text-[var(--tx3)] uppercase tracking-wider">
            <ShieldCheck size={12} /> Wildcard SSL
          </div>
          <div className="text-[15px] font-semibold mt-1 flex items-center gap-1.5 text-[var(--ok)]">
            <CheckCircle2 size={14} /> Aktywny
          </div>
          <div className="text-[10px] text-[var(--tx3)] mt-1">*.infradesk.pl · Let's Encrypt</div>
        </Card>
        <Card className="p-[var(--sp-4)]">
          <div className="flex items-center gap-2 text-[11px] text-[var(--tx3)] uppercase tracking-wider">
            <Sparkles size={12} /> Gotowe funkcje
          </div>
          <div className="text-[15px] font-semibold mt-1">Tickety · Urządzenia · Vault · AI</div>
        </Card>
      </div>

      {clientsQ.isLoading ? (
        <SkeletonCard />
      ) : activePortals.length === 0 ? (
        <Card className="p-[var(--sp-6)] text-center text-[var(--tx3)]">
          <Globe2 size={32} className="mx-auto mb-3 opacity-40" />
          <div className="text-[14px] mb-2">Jeszcze żaden klient nie ma portalu.</div>
          <Link to="/clients">
            <Button variant="ghost" className="gap-1.5">
              Dodaj klienta
            </Button>
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="px-[var(--sp-4)] py-[var(--sp-3)] border-b border-[var(--bd)] text-[13px] font-medium">
            Portale klientów
          </div>
          <div className="divide-y divide-[var(--bd)]">
            {activePortals.map((r) => {
              const c = r.client;
              return (
                <div key={r.relationId} className="flex items-center gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-3)]">
                  <div
                    className="w-9 h-9 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
                    style={{ background: 'var(--pri-l)' }}
                  >
                    {c.logoUrl ? (
                      <img src={c.logoUrl} alt="" className="w-full h-full rounded-[var(--r-s)] object-cover" />
                    ) : (
                      <Building size={15} className="text-[var(--pri)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/clients/${c.id}`} className="text-[13px] font-medium hover:underline truncate">
                        {c.name}
                      </Link>
                      <Badge variant="neutral">Plan {c.plan}</Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--tx3)] mt-0.5">
                      <Globe2 size={10} />
                      <code className="text-[var(--pri)]">{c.slug}.infradesk.pl</code>
                      {c.email && (
                        <>
                          <span>·</span>
                          <Mail size={10} />
                          <span className="truncate">{c.email}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyLink(c.slug)}
                    className="p-1.5 rounded hover:bg-[var(--sf-h)] text-[var(--tx3)]"
                    title="Kopiuj link"
                  >
                    <Copy size={13} />
                  </button>
                  <a
                    href={`https://${c.slug}.infradesk.pl`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="p-1.5 rounded hover:bg-[var(--sf-h)] text-[var(--tx3)]"
                    title="Otwórz portal klienta"
                  >
                    <ExternalLink size={13} />
                  </a>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="p-[var(--sp-4)]">
        <h2 className="text-[14px] font-semibold mb-2 flex items-center gap-2">
          <Sparkles size={13} className="text-[var(--pri)]" /> Co widzi klient w portalu?
        </h2>
        <ul className="text-[12px] text-[var(--tx2)] space-y-1 list-disc pl-5">
          <li>Kokpit z własnymi metrykami (tylko jego dane — RLS wymusza izolację).</li>
          <li>Swoje zgłoszenia (tworzenie, komentarze, ocena) oraz kalendarz wizyt serwisantów.</li>
          <li>Listę swoich urządzeń z audit score, alertami i historią serwisową.</li>
          <li>Własny sejf haseł (Wszystkie/Moje/Współdzielone — zależnie od roli).</li>
          <li>Iris AI — chat kontekstowy do jego danych.</li>
          <li>Ustawienia konta + 2FA.</li>
        </ul>
        <p className="text-[11px] text-[var(--tx3)] mt-3">
          Klient NIE widzi innych workspace'ów, AI Shadow Mode, kosztów AI, ani listy wszystkich klientów MSP.
        </p>
      </Card>
    </div>
  );
}
