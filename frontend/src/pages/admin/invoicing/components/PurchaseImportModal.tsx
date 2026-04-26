/**
 * Modal: Wczytaj fakturę zakupu z pliku
 * Obsługa: skan/zdjęcie (OCR), PDF, XML (Fakturownia), EPP (Subiekt)
 */
import { useState, useRef } from 'react';
import { X, Upload, FileText, Image as ImageIcon, FileType, Loader2, CheckCircle2 } from 'lucide-react';
import api from '../../../../api/client';
import toast from 'react-hot-toast';

interface ExtractedData {
  number?: string;
  issueDate?: string;
  dueDate?: string;
  sellerName?: string;
  sellerNip?: string;
  buyerName?: string;
  buyerNip?: string;
  totalNet?: number;
  totalVat?: number;
  totalGross?: number;
}

export function PurchaseImportModal({ onClose, onImport }: { onClose: () => void; onImport: (data: ExtractedData) => void }) {
  const [mode, setMode] = useState<'scan' | 'xml' | 'epp'>('scan');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ extracted: ExtractedData; confidence: string; rawText?: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const endpoint = mode === 'scan' ? '/invoicing/purchase-import/scan' :
                       mode === 'xml' ? '/invoicing/purchase-import/xml' :
                       '/invoicing/purchase-import/epp';
      const { data } = await api.post(endpoint, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(data);
      if (data.confidence === 'high') {
        toast.success('Dane wczytane — sprawdź i zatwierdź');
      } else {
        toast('Wczytano częściowo — uzupełnij brakujące pola', { icon: '⚠️' });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Błąd wczytywania');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function applyData() {
    if (!result?.extracted) return;
    onImport(result.extracted);
    onClose();
  }

  const accept = mode === 'scan' ? 'image/*,application/pdf' : mode === 'xml' ? '.xml,text/xml' : '.epp,.txt';

  return (
    <div onClick={() => !loading && onClose()} style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(4px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card, #0F1628)', border: '1px solid var(--border)', borderRadius: 14,
        width: '100%', maxWidth: 640, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)' }}>Wczytaj fakturę zakupu</div>
            <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>OCR / XML / EPP — automatyczne uzupełnienie pól</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--td)', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 16 }}>
          {([
            { v: 'scan', label: 'Skan / zdjęcie / PDF', icon: ImageIcon },
            { v: 'xml', label: 'XML (Fakturownia)', icon: FileType },
            { v: 'epp', label: 'EPP (Subiekt/Insert)', icon: FileText },
          ] as const).map(t => (
            <button key={t.v} type="button" onClick={() => { setMode(t.v); setResult(null); }} style={{
              flex: 1, padding: '10px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
              background: mode === t.v ? 'var(--accent-g)' : 'transparent',
              color: mode === t.v ? 'var(--accent-s, #818CF8)' : 'var(--td)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}><t.icon size={12} /> {t.label}</button>
          ))}
        </div>

        {/* Upload area */}
        {!result && (
          <div onClick={() => !loading && inputRef.current?.click()} style={{
            padding: 40, borderRadius: 12, border: '2px dashed var(--border)', textAlign: 'center',
            cursor: loading ? 'wait' : 'pointer', background: 'var(--hover-bg)',
          }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
            {loading ? (
              <>
                <Loader2 size={32} className="spinning" style={{ color: 'var(--accent)', margin: '0 auto 12px' }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>Przetwarzam...</div>
                <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 4 }}>{mode === 'scan' ? 'OCR może potrwać do 30s' : 'Parsowanie pliku...'}</div>
              </>
            ) : (
              <>
                <Upload size={32} style={{ color: 'var(--accent)', margin: '0 auto 12px' }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>Kliknij aby wybrać plik</div>
                <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 4 }}>
                  {mode === 'scan' && 'JPG, PNG, PDF — maks. 20 MB'}
                  {mode === 'xml' && 'Plik XML wyeksportowany z Fakturownia, wFirma, inFakt'}
                  {mode === 'epp' && 'Plik EPP z Subiekt GT / Insert'}
                </div>
              </>
            )}
            <input ref={inputRef} type="file" accept={accept} onChange={handleFile} style={{ display: 'none' }} />
          </div>
        )}

        {/* Results preview */}
        {result && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, marginBottom: 14,
              background: result.confidence === 'high' ? 'rgba(74,222,128,0.08)' : 'rgba(251,191,36,0.08)',
              border: `1px solid ${result.confidence === 'high' ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'}`,
            }}>
              <CheckCircle2 size={16} style={{ color: result.confidence === 'high' ? '#4ADE80' : '#FBBF24' }} />
              <div style={{ fontSize: 12, color: 'var(--ts)' }}>
                Rozpoznano <strong style={{ color: 'var(--t)' }}>{Object.keys(result.extracted).filter(k => (result.extracted as any)[k]).length}</strong> pól.
                {result.confidence !== 'high' && ' Sprawdź dane przed zapisaniem.'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {[
                { label: 'Numer faktury', value: result.extracted.number },
                { label: 'Data wystawienia', value: result.extracted.issueDate },
                { label: 'Termin płatności', value: result.extracted.dueDate },
                { label: 'NIP sprzedawcy', value: result.extracted.sellerNip },
                { label: 'Sprzedawca', value: result.extracted.sellerName },
                { label: 'NIP nabywcy', value: result.extracted.buyerNip },
                { label: 'Razem netto', value: result.extracted.totalNet ? `${result.extracted.totalNet.toFixed(2)} zł` : null },
                { label: 'Razem brutto', value: result.extracted.totalGross ? `${result.extracted.totalGross.toFixed(2)} zł` : null },
              ].map(f => (
                <div key={f.label} style={{ padding: 10, borderRadius: 8, background: 'var(--hover-bg)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--td)', marginBottom: 4 }}>{f.label}</div>
                  <div style={{ fontSize: 12, color: f.value ? 'var(--t)' : 'var(--td)', fontWeight: f.value ? 600 : 400 }}>{f.value || '— brak —'}</div>
                </div>
              ))}
            </div>

            {result.rawText && (
              <details style={{ marginBottom: 14 }}>
                <summary style={{ fontSize: 11, color: 'var(--tm)', cursor: 'pointer', padding: 6 }}>Pokaż tekst rozpoznany przez OCR</summary>
                <pre style={{ fontSize: 10, color: 'var(--td)', padding: 10, background: 'var(--hover-bg)', borderRadius: 8, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{result.rawText}</pre>
              </details>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setResult(null)} style={{
                padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--ts)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>Wczytaj inny plik</button>
              <button onClick={applyData} style={{
                padding: '9px 18px', borderRadius: 9, border: 'none',
                background: 'var(--cta)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(99,102,241,0.2)',
              }}>Wstaw do faktury</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
