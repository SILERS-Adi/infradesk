import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { usersApi } from '../../../api/users';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { UserForm } from '../../../components/forms/UserForm';
import { formatDate, getErrorMessage } from '../../../utils/helpers';
import type { User } from '../../../types';

const ROLE_COLORS: Record<string, 'red' | 'blue' | 'green'> = { ADMIN: 'red', TECHNICIAN: 'blue', CLIENT: 'green' };
const ROLE_LABELS: Record<string, string> = { ADMIN: 'Administrator', TECHNICIAN: 'Technik', CLIENT: 'Klient' };

export function UsersPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      toast.success('Użytkownik usunięty');
      qc.invalidateQueries({ queryKey: ['users'] });
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Imię i nazwisko',
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.firstName} {row.lastName}</div>
          <div className="text-xs text-gray-500">{row.email}</div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Rola',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {(row.roles?.length ? row.roles : [row.role]).map((r: string) => (
            <Badge key={r} color={ROLE_COLORS[r]}>{ROLE_LABELS[r]}</Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Klient',
      render: (row) => row.client?.name ?? <span className="text-gray-400 text-xs">—</span>,
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (row) => <Badge color={row.isActive ? 'green' : 'gray'}>{row.isActive ? 'Aktywny' : 'Nieaktywny'}</Badge>,
    },
    {
      key: 'lastLoginAt',
      header: 'Ostatnie logowanie',
      render: (row) => <span className="text-xs text-gray-500">{row.lastLoginAt ? formatDate(row.lastLoginAt) : 'Nigdy'}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => setEditTarget(row)}>Edytuj</Button>
          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => setDeleteTarget(row)}>Usuń</Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Użytkownicy"
        subtitle={`${users.length} użytkowników`}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
            Nowy użytkownik
          </Button>
        }
      />

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <DataTable
          columns={columns}
          data={users}
          loading={isLoading}
          keyExtractor={(row) => (row as unknown as User).id}
          emptyTitle="Brak użytkowników"
        />
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} size="lg" noPadding>
        <UserForm
          onSuccess={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['users'] });
          }}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>

      {editTarget && (
        <Modal open={!!editTarget} onClose={() => setEditTarget(null)} size="lg" noPadding>
          <UserForm
            user={editTarget}
            onSuccess={() => {
              setEditTarget(null);
              qc.invalidateQueries({ queryKey: ['users'] });
            }}
            onCancel={() => setEditTarget(null)}
          />
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Usuń użytkownika"
        message={`Czy usunąć "${deleteTarget?.firstName} ${deleteTarget?.lastName}"?`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
