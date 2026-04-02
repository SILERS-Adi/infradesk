/**
 * IDS 1.0 — Product Picker (inline autocomplete for document items table)
 * Searches GET /api/invoicing/products?search=...
 * On select: fills name + priceNet + vatRate
 */
import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import api from '../../../../api/client';

interface Product {
  id: string;
  name: string;
  sku: string | null;
  priceNet: number | string;
  vatRate: string;
  unit: string;
}

interface ProductPickerProps {
  /** Current value shown in the input */
  value: string;
  /** Called on manual text change (user typing) */
  onTextChange: (text: string) => void;
  /** Called when user selects a product from dropdown */
  onSelect: (product: { name: string; priceNet: number; vatRate: string }) => void;
  /** Placeholder */
  placeholder?: string;
}

export function ProductPicker({ value, onTextChange, onSelect, placeholder }: ProductPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  // We track whether user is searching vs just editing the name
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!searching || !query || query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/invoicing/products', { params: { search: query, per_page: '6' } });
        setResults(data.items || []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, searching]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearching(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInputChange = (text: string) => {
    onTextChange(text);
    setQuery(text);
    setSearching(true);
  };

  const handleSelect = (p: Product) => {
    onSelect({ name: p.name, priceNet: Number(p.priceNet), vatRate: p.vatRate });
    setOpen(false);
    setSearching(false);
    setResults([]);
  };

  const fmtPrice = (v: number | string) => Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2 });

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={placeholder || 'Wpisz lub wyszukaj produkt...'}
        style={{
          width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 'var(--rs)',
          border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--t)', outline: 'none',
        }}
      />

      {/* Subtle search indicator */}
      {loading && (
        <div style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          width: 12, height: 12, border: '2px solid var(--accent)', borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
      )}

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40,
          marginTop: 2, borderRadius: 'var(--rs)',
          background: 'var(--bg2)', border: '1px solid var(--border-l)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          maxHeight: 220, overflowY: 'auto',
        }}>
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '8px 12px',
                background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
                cursor: 'pointer', textAlign: 'left', transition: 'background .12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--tm)', marginTop: 1 }}>
                  {p.sku || '—'} · {p.unit}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ts)' }}>{fmtPrice(p.priceNet)} zl</div>
                <div style={{ fontSize: 10, color: 'var(--tm)' }}>VAT {p.vatRate}%</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
