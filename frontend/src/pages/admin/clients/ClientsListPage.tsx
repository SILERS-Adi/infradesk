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

  // Reset page when search changes
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
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Szukaj po nazwie, NIP, mieście, emailu..."
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-12 text-gray-400 text-sm">Ładowanie...</div>
      )}

      {!isLoading && clients.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Brak klientów</p>
          <p className="text-gray-400 text-sm mt-1">Dodaj pierwszego klienta klikając przycisk powyżej.</p>
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
          <div className="hidden md:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nazwa</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Skrócona</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Miasto</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kontakt</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Zgłoszenia</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {clients.map(client => (
                  <tr
                    key={client.id}
                    onClick={() => navigate(`/clients/${client.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <ClientAvatar client={client} size="sm" />
                        <span className="font-medium text-gray-900">{client.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {client.legalName ?? client.name}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {client.city ?? client.addressLine1 ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {client.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                          <span>{client.phone}</span>
                        </div>
                      )}
                      {client.email && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
                          <Mail className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate max-w-[160px]">{client.email}</span>
                        </div>
                      )}
                      {!client.phone && !client.email && '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <ClientStatusBadge status={client.status} />
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {(client._count?.tickets ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                          <Ticket className="h-3 w-3" />
                          {client._count?.tickets}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <ChevronRight className="h-4 w-4 text-gray-300" />
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
                className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-4 cursor-pointer active:bg-gray-50 transition-colors"
              >
                <ClientAvatar client={client} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 truncate">{client.name}</span>
                    <ClientStatusBadge status={client.status} />
                  </div>
                  {client.legalName && (
                    <div className="text-xs text-gray-500 truncate">{client.legalName}</div>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>{client.city ?? client.addressLine1 ?? ''}</span>
                    {(client._count?.tickets ?? 0) > 0 && (
                      <span className="text-orange-500">{client._count?.tickets} zgl.</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Strona {page} z {totalPages} · {total} klientów
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Poprzednia
                </button>

                {/* Page numbers */}
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
                        className={clsx(
                          'w-9 h-9 text-sm font-medium rounded-xl transition-colors',
                          page === p
                            ? 'bg-brand-600 text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                        )}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
        className={clsx(dim, 'rounded-xl object-contain bg-gray-50 border border-gray-100 flex-shrink-0')}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }

  return (
    <div className={clsx(
      dim,
      'rounded-xl bg-brand-100 text-brand-700 font-bold flex items-center justify-center flex-shrink-0'
    )}>
      {initials}
    </div>
  );
}
