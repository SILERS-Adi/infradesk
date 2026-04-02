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

export function ProductsPage() {
  return <PlaceholderPage title="Faktury — Produkty" subtitle="Katalog produktów i usług" description="Zarządzanie produktami, cenami, stawkami VAT." />;
}

export function WarehousesPage() {
  return <PlaceholderPage title="Faktury — Magazyn" subtitle="Stany magazynowe" description="Przegląd stanów, ruchy magazynowe, alerty niskiego stanu." />;
}

export function PaymentsPage() {
  return <PlaceholderPage title="Faktury — Płatności" subtitle="Rozliczenia dokumentów" description="Śledzenie płatności, zaległości, raporty." />;
}

export function ReportsPage() {
  return <PlaceholderPage title="Faktury — Raporty" subtitle="Raporty sprzedaży, zakupów, VAT" description="Raporty sprzedażowe, zakupowe, magazynowe i rejestr VAT. Będą dostępne po podłączeniu backendu." />;
}

export function ImportPage() {
  return <PlaceholderPage title="Faktury — Import" subtitle="Import danych CSV" description="Import kontrahentów i produktów z plików CSV. Będzie dostępny po podłączeniu backendu." />;
}
