import { useQuery } from '@tanstack/react-query';
import { User, Mail, Phone, Building2 } from 'lucide-react';
import { operatorApi } from '../../api/operator';
import { PageHeader } from '../../components/ui/PageHeader';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  workspaceName: string;
}

export default function OperatorContacts() {
  // Build contacts from client workspace memberships
  const { data: clients, isLoading } = useQuery({
    queryKey: ['operator', 'clients'],
    queryFn: operatorApi.getClients,
  });

  // Flatten: each client → its contact info as a row
  const contacts: Contact[] = (clients ?? []).map(c => ({
    id: c.id,
    firstName: c.name.split(' ')[0] ?? '',
    lastName: '',
    email: c.email ?? '—',
    phone: c.phone,
    workspaceName: c.name,
  }));

  const columns: Column<Contact>[] = [
    { key: 'name', header: 'Kontakt', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <User size={14} color="#6366F1" />
        </div>
        <span style={{ fontWeight: 600, color: 'var(--t)', fontSize: 13 }}>{r.workspaceName}</span>
      </div>
    )},
    { key: 'email', header: 'Email', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ts)' }}>
        <Mail size={13} color="var(--td)" /> {r.email}
      </div>
    )},
    { key: 'phone', header: 'Telefon', render: (r) => r.phone ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ts)' }}>
        <Phone size={13} color="var(--td)" /> {r.phone}
      </div>
    ) : <span style={{ color: 'var(--td)' }}>—</span> },
    { key: 'company', header: 'Firma', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--tm)' }}>
        <Building2 size={13} color="var(--td)" /> {r.workspaceName}
      </div>
    )},
  ];

  if (isLoading) return <LoadingSpinner />;

  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader title="Kontakty" subtitle="Osoby kontaktowe z firm klientów" />
      <DataTable
        columns={columns}
        data={contacts}
        loading={false}
        keyExtractor={r => r.id}
        emptyTitle="Brak kontaktów"
        emptyDescription="Kontakty pojawią się po dodaniu klientów"
      />
    </div>
  );
}
