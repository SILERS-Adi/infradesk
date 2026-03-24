import { useState, useRef, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';

interface CityResult {
  name: string;
  county: string;
  postcode?: string;
}

interface Props {
  label?: string;
  value: string;
  onChange: (city: string) => void;
  onSelect?: (city: string, postcode?: string) => void;
  error?: string;
  placeholder?: string;
  className?: string;
}

function shortenCounty(county: string): string {
  return county
    .replace(/^powiat\s+/i, 'pow. ')
    .replace(/^Powiat\s+/i, 'pow. ');
}

export function CityInput({ label, value, onChange, onSelect, error, placeholder = 'Miejscowość', className }: Props) {
  const [results, setResults] = useState<CityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounce(value, 400);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=10&addressdetails=1&countrycodes=pl`,
        { headers: { 'Accept-Language': 'pl', 'User-Agent': 'InfraDesk/1.0' } }
      );
      const data = await res.json() as Array<{
        address?: {
          city?: string; town?: string; village?: string; hamlet?: string;
          county?: string; state_district?: string;
          postcode?: string;
        };
      }>;

      // Extract unique cities with their county
      const seen = new Set<string>();
      const cities: CityResult[] = [];
      for (const item of data) {
        const addr = item.address;
        if (!addr) continue;
        const name = addr.city || addr.town || addr.village || addr.hamlet;
        if (!name) continue;
        const county = addr.county || addr.state_district || '';
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        cities.push({ name, county, postcode: addr.postcode });
        if (cities.length >= 6) break;
      }

      setResults(cities);
      setOpen(cities.length > 0);
    } catch {
      setResults([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) { setSelected(false); return; }
    search(debounced);
  }, [debounced]); // eslint-disable-line

  const handleSelect = (city: CityResult) => {
    setSelected(true);
    setOpen(false);
    setResults([]);
    onChange(city.name);
    onSelect?.(city.name, city.postcode);
  };

  return (
    <div ref={containerRef} className={clsx('flex flex-col gap-1 relative', className)}>
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setSelected(false); }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder={placeholder}
          className={clsx(
            'block w-full rounded-lg border px-3 py-2 pr-8 text-sm shadow-sm placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
            error ? 'border-red-300 focus:ring-red-400' : 'border-gray-300'
          )}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-gray-400" />
        )}
      </div>

      {/* Suggestions dropdown */}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          {results.map((city, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => handleSelect(city)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-indigo-50 transition-colors text-left"
            >
              <span className="font-medium text-gray-900">{city.name}</span>
              {city.county && (
                <span className="text-xs text-gray-500">({shortenCounty(city.county)})</span>
              )}
              {city.postcode && (
                <span className="ml-auto text-xs text-gray-400 font-mono">{city.postcode}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
