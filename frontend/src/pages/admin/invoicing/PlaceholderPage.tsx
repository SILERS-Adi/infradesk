import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';

interface PlaceholderPageProps {
  title: string;
  subtitle?: string;
  description?: string;
}

export function PlaceholderPage({ title, subtitle, description }: PlaceholderPageProps) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div style={{ padding: '0 24px 24px' }}>
        <Card>
          <EmptyState
            title="Strona w przygotowaniu"
            description={description || 'Ta funkcja zostanie uruchomiona po podłączeniu backendu modułu fakturowego.'}
          />
        </Card>
      </div>
    </>
  );
}

export function WarehousesPage() {
  return <PlaceholderPage title="Faktury — Magazyn" subtitle="Stany magazynowe" description="Przegląd stanów, ruchy magazynowe, alerty niskiego stanu." />;
}

export function PaymentsPage() {
  return <PlaceholderPage title="Faktury — Płatności" subtitle="Rozliczenia dokumentów" description="Śledzenie płatności, zaległości, raporty." />;
}

export function ImportPage() {
  return <PlaceholderPage title="Faktury — Import" subtitle="Import danych CSV" description="Import kontrahentów i produktów z plików CSV. Będzie dostępny po podłączeniu backendu." />;
}
