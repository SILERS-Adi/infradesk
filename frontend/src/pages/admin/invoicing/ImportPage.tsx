/**
 * Import kontrahentów i produktów z CSV
 */
import { useState, useRef } from 'react';
import { Upload, Download, Users, Package, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';

interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

function ImportSection({
  type,
  title,
  description,
  icon: Icon,
  color,
}: {
  type: 'contractors' | 'products';
  title: string;
  description: string;
  icon: typeof Users;
  color: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post(`/invoicing/import/${type}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(data);
      toast.success(`Import zakończony: ${data.created} nowych, ${data.updated} zaktualizowanych`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Błąd importu');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function downloadTemplate() {
    try {
      const response = await api.get(`/invoicing/import/template/${type}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = type === 'contractors' ? 'kontrahenci_szablon.csv' : 'produkty_szablon.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Nie udało się pobrać szablonu'); }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          <Icon size={24} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--tm)', marginTop: 2 }}>{description}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Button variant="secondary" icon={<Download size={14} />} onClick={downloadTemplate}>
          Pobierz szablon CSV
        </Button>
        <Button variant="primary" icon={uploading ? <Loader2 size={14} className="spinning" /> : <Upload size={14} />}
          onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? 'Importuję...' : 'Wgraj plik CSV'}
        </Button>
        <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: 'none' }} />
      </div>

      {result && (
        <div style={{ padding: 14, borderRadius: 10, background: 'var(--hover-bg)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 20, marginBottom: result.errors.length > 0 ? 12 : 0 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Wczytano</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t)' }}>{result.total}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dodano</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#4ADE80' }}>{result.created}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Zaktualizowano</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#60A5FA' }}>{result.updated}</div>
            </div>
            {result.skipped > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--td)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pominięto</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#FBBF24' }}>{result.skipped}</div>
              </div>
            )}
          </div>
          {result.errors.length > 0 && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#F87171', marginBottom: 6 }}>Błędy:</div>
              {result.errors.map((e, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--ts)', lineHeight: 1.5 }}>• {e}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function ImportCsvPage() {
  return (
    <>
      <PageHeader title="Import danych" subtitle="Wgraj kontrahentów i produkty z pliku CSV" back="/invoicing" />

      <div style={{ padding: '0 24px 80px', maxWidth: 840, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Instrukcja */}
        <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <div style={{ fontSize: 12, color: 'var(--ts)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--t)' }}>Jak importować?</strong>
            <ol style={{ margin: '8px 0 0 18px', padding: 0 }}>
              <li>Pobierz szablon CSV — ma przykładowe dane i poprawne nagłówki</li>
              <li>Uzupełnij plik swoimi danymi (możesz użyć Excel, Google Sheets, Numbers)</li>
              <li>Zapisz jako CSV (UTF-8) i wgraj plik</li>
              <li>System sprawdzi duplikaty po NIP/SKU — istniejące wpisy zaktualizuje, nowe doda</li>
            </ol>
          </div>
        </div>

        <ImportSection
          type="contractors"
          title="Kontrahenci"
          description="Import bazy klientów i dostawców. Duplikaty wykrywane po NIP lub nazwie."
          icon={Users}
          color="#818CF8"
        />

        <ImportSection
          type="products"
          title="Produkty i usługi"
          description="Import katalogu produktów. Duplikaty wykrywane po SKU lub nazwie."
          icon={Package}
          color="#4ADE80"
        />

        <div style={{ padding: 14, borderRadius: 10, background: 'var(--hover-bg)', fontSize: 11, color: 'var(--tm)', lineHeight: 1.6 }}>
          💡 <strong>Wspierane formaty separatora:</strong> przecinek (,), średnik (;), tabulator. Plik musi być w kodowaniu <strong>UTF-8</strong>.
          Pierwszy wiersz = nagłówki kolumn. Nazwy kolumn: po polsku lub angielsku (obsługiwane oba).
        </div>
      </div>
    </>
  );
}
