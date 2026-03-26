import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Building2, ChevronRight, Upload, ChevronLeft, Phone, Mail, Ticket } from 'lucide-react';
import { clientsApi } from '../../../api/clients';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ClientForm } from '../../../components/forms/ClientForm';
import { ClientStatusBadge } from '../../../components/ui/StatusBadge';
import { ImportCsvModal } from '../../../components/ui/ImportCsvModal';
import { useDebounce } from '../../../hooks/useDebounce';
import type { Client } from '../../../types';
import { clsx } from 'clsx';

const PAGE_SIZE = 20;

export function ClientsListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const debouncedSearch = useDebounce(search);

  const { data, isLoading } = useQuery({
    queryKey: ['clients', debouncedSearch, page],
    queryFn: () => clientsApi.getPaged({ search: debouncedSearch || undefined, page, limit: PAGE_SIZE }),
  });

  const clients = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 1;
  const total = pagination?.total ?? 0;

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Klienci"
        subtitle={`${total} klientów`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-all duration-200 active:scale-[0.97]"
              style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
              Nowy klient
            </Button>
          </div>
        }
      />

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.25)' }} />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Szukaj po nazwie, NIP, mieście, emailu..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl focus:outline-none transition-all duration-200 placeholder:text-white/20"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.85)',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.08)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-12 text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Ładowanie...</div>
      )}

      {!isLoading && clients.length === 0 && (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Building2 className="h-10 w-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
          <p className="font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Brak klientów</p>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>Dodaj pierwszego klienta klikając przycisk powyżej.</p>
          <div className="mt-4">
            <Button onClick={() => setShowCreate(true)} icon={<Plus className="h-4 w-4" />}>
              Dodaj klienta
            </Button>
          </div>
        </div>
      )}

      {!isLoading && clients.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Nazwa</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Skrócona</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Miasto</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Kontakt</th>
                  <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Status</th>
                  <th className="text-center px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Zgłoszenia</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {clients.map(client => (
                  <tr
                    key={client.id}
                    onClick={() => navigate(`/clients/${client.id}`)}
                    className="cursor-pointer transition-colors duration-150"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <ClientAvatar client={client} size="sm" />
                        <span className="font-medium text-white/85">{client.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {client.legalName ?? client.name}
                    </td>
                    <td className="px-5 py-3.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {client.city ?? client.addressLine1 ?? '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      {client.phone && (
                        <div className="flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          <Phone className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
                          <span>{client.phone}</span>
                        </div>
                      )}
                      {client.email && (
                        <div className="flex items-center gap-1.5 text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          <Mail className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate max-w-[160px]">{client.email}</span>
                        </div>
                      )}
                      {!client.phone && !client.email && <span style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <ClientStatusBadge status={client.status} />
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {(client._count?.tickets ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(251,146,60,0.12)', color: '#FB923C' }}>
                          <Ticket className="h-3 w-3" />
                          {client._count?.tickets}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <ChevronRight className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.15)' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {clients.map(client => (
              <div
                key={client.id}
                onClick={() => navigate(`/clients/${client.id}`)}
                className="rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-all duration-200 active:scale-[0.99]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <ClientAvatar client={client} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white/85 truncate">{client.name}</span>
                    <ClientStatusBadge status={client.status} />
                  </div>
                  {client.legalName && (
                    <div className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{client.legalName}</div>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    <span>{client.city ?? client.addressLine1 ?? ''}</span>
                    {(client._count?.tickets ?? 0) > 0 && (
                      <span style={{ color: '#FB923C' }}>{client._count?.tickets} zgl.</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.15)' }} />
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Strona {page} z {totalPages} · {total} klientów
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Poprzednia
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let p: number;
                    if (totalPages <= 5) p = i + 1;
                    else if (page <= 3) p = i + 1;
                    else if (page >= totalPages - 2) p = totalPages - 4 + i;
                    else p = page - 2 + i;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className="w-9 h-9 text-sm font-medium rounded-xl transition-all duration-200"
                        style={page === p
                          ? { background: 'linear-gradient(145deg, #6D28D9, #2563EB)', color: '#fff', boxShadow: '0 2px 8px rgba(109,40,217,0.2)' }
                          : { color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.03)' }
                        }
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  Następna
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal: nowy klient */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} size="xl" noPadding>
        <ClientForm
          onSuccess={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['clients'] });
          }}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>

      <ImportCsvModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['clients'] })}
      />
    </div>
  );
}

function ClientAvatar({ client, size }: { client: Client; size: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-11 h-11 text-sm';
  const initials = client.name.slice(0, 2).toUpperCase();

  if (client.logoUrl) {
    return (
      <img
        src={client.logoUrl}
        alt={client.name}
        className={clsx(dim, 'rounded-xl object-contain flex-shrink-0')}
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }

  return (
    <div className={clsx(dim, 'rounded-xl font-bold flex items-center justify-center flex-shrink-0')}
      style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>
      {initials}
    </div>
  );
}
