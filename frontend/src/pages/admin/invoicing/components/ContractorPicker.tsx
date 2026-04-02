/**
 * IDS 1.0 — Contractor Picker (autocomplete)
 * Searches GET /api/invoicing/contractors?search=...
 * On select: fills name + nip. User can still edit manually.
 */
import { useState, useEffect, useRef } from 'react';
import { Search, X, Users } from 'lucide-react';
import api from '../../../../api/client';

interface Contractor {
  id: string;
  name: string;
  nip: string | null;
  city: string | null;
}

interface ContractorPickerProps {
  onSelect: (contractor: { name: string; nip: string }) => void;
}

export function ContractorPicker({ onSelect }: ContractorPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Contractor[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Search on query change (debounced)
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/invoicing/contractors', { params: { search: query, per_page: '8' } });
        setResults(data.items || []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (c: Contractor) => {
    onSelect({ name: c.name, nip: c.nip || '' });
    setQuery('');
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', marginBottom: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 'var(--rs)',
        border: '1px solid var(--border)', background: 'var(--hover-bg)',
        transition: 'var(--trf)',
      }}>
        <Search size={14} style={{ color: 'var(--td)', flexShrink: 0 }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder="Wyszukaj kontrahenta po nazwie, NIP lub mieście..."
          style={{
            flex: 1, border: 'none', background: 'transparent',
            color: 'var(--t)', fontSize: 13, outline: 'none',
          }}
        />
        {query && (
          <button type="button" onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', display: 'flex', padding: 2 }}>
            <X size={14} />
          </button>
        )}
        {loading && (
          <div style={{ width: 14, height: 14, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        )}
      </div>

      {/* Dropdown results */}
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
          marginTop: 4, borderRadius: 'var(--rs)',
          background: 'var(--bg2)', border: '1px solid var(--border-l)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          maxHeight: 280, overflowY: 'auto',
        }}>
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleSelect(c)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 14px',
                background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
                cursor: 'pointer', textAlign: 'left', transition: 'background .12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--accent-g)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Users size={14} style={{ color: 'var(--accent)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 1 }}>
                  {c.nip ? `NIP: ${c.nip}` : ''}
                  {c.nip && c.city ? ' · ' : ''}
                  {c.city || ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
          marginTop: 4, padding: '12px 14px', borderRadius: 'var(--rs)',
          background: 'var(--bg2)', border: '1px solid var(--border-l)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          fontSize: 12, color: 'var(--tm)', textAlign: 'center',
        }}>
          Nie znaleziono kontrahenta
        </div>
      )}
    </div>
  );
}
