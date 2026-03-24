import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Building2, MapPin, Phone, Mail, ChevronRight, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { clientsApi } from '../../../api/clients';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { ClientForm } from '../../../components/forms/ClientForm';
import { ClientStatusBadge } from '../../../components/ui/StatusBadge';
import { ImportCsvModal } from '../../../components/ui/ImportCsvModal';
import { useDebounce } from '../../../hooks/useDebounce';
import { getErrorMessage } from '../../../utils/helpers';
import type { Client } from '../../../types';
import { clsx } from 'clsx';

export function ClientsListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const debouncedSearch = useDebounce(search);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients', debouncedSearch],
    queryFn: () => clientsApi.getAll({ search: debouncedSearch || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => clientsApi.delete(id),
    onSuccess: () => {
      toast.success('Klient usunięty');
      qc.invalidateQueries({ queryKey: ['clients'] });
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div>
      <PageHeader
        title="Klienci"
        subtitle={`${clients.length} klientów`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Import CSV Subiekt
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj klienta..."
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-12 text-gray-400 text-sm">Ładowanie...</div>
      )}

      {/* Empty */}
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

      {/* Mobile: cards */}
      {!isLoading && clients.length > 0 && (
        <>
          {/* Desktop: table */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Klient</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Miasto</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kontakt</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Lok.</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Zgl.</th>
                  <th className="px-5 py-3" />
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
                        <div>
                          <div className="font-medium text-gray-900">{client.name}</div>
                          {client.legalName && (
                            <div className="text-xs text-gray-400">{client.legalName}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{client.city ?? '—'}</td>
                    <td className="px-5 py-3.5 text-gray-600">
                      <div>{client.email ?? '—'}</div>
                      {client.phone && <div className="text-xs text-gray-400">{client.phone}</div>}
                    </td>
                    <td className="px-5 py-3.5">
                      <ClientStatusBadge status={client.status} />
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 text-center">{client._count?.locations ?? 0}</td>
                    <td className="px-5 py-3.5 text-gray-600 text-center">{client._count?.tickets ?? 0}</td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(client); }}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors"
                      >
                        Usuń
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {clients.map(client => (
              <div
                key={client.id}
                onClick={() => navigate(`/clients/${client.id}`)}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-4 cursor-pointer active:bg-gray-50 transition-colors"
              >
                <ClientAvatar client={client} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 truncate">{client.name}</span>
                    <ClientStatusBadge status={client.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    {client.city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{client.city}
                      </span>
                    )}
                    {client.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />{client.phone}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>{client._count?.locations ?? 0} lok.</span>
                    <span>{client._count?.tickets ?? 0} zgl.</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal: nowy klient */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nowy klient" size="xl">
        <ClientForm
          onSuccess={() => setShowCreate(false)}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Usuń klienta"
        message={`Czy na pewno chcesz usunąć klienta "${deleteTarget?.name}"? Tej operacji nie można cofnąć.`}
        loading={deleteMutation.isPending}
      />

      <ImportCsvModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['clients'] })}
      />
    </div>
  );
}

// Avatar klienta z logo lub inicjałami
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
