import { useState, useRef } from 'react';
import { Upload, X, CheckCircle, AlertCircle, Loader2, FileText } from 'lucide-react';
import { clientsApi } from '../../api/clients';

interface ParsedRow {
  name: string;
  taxId?: string;
  addressLine1?: string;
  city?: string;
  phone?: string;
  email?: string;
  type: 'Firma' | 'Osoba';
  error?: string;
}

interface ImportResult {
  name: string;
  status: 'ok' | 'error';
  message?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function parseSubiektCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Skip header row
  const rows = lines.slice(1);
  const results: ParsedRow[] = [];

  for (const line of rows) {
    // Parse semicolon-separated with possible quoted fields
    const cols = parseCsvLine(line, ';');
    if (cols.length < 2) continue;

    const [rodzaj, nazwa, nip, adres, miejscowosc, , telefon, email] = cols;

    const name = nazwa.replace(/^"+|"+$/g, '').trim();
    if (!name) continue;

    results.push({
      type: rodzaj.trim() === 'Osoba' ? 'Osoba' : 'Firma',
      name,
      taxId: nip?.replace(/[-\s]/g, '').trim() || undefined,
      addressLine1: adres?.trim() || undefined,
      city: miejscowosc?.trim() || undefined,
      phone: telefon?.trim() || undefined,
      email: email?.trim() || undefined,
    });
  }

  return results;
}

function parseCsvLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function ImportCsvModal({ open, onClose, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState('');
  const [done, setDone] = useState(false);

  if (!open) return null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResults([]);
    setDone(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseSubiektCsv(text);
      setRows(parsed);
      setSelected(new Set(parsed.map((_, i) => i)));
    };
    reader.readAsText(file, 'utf-8');
  };

  const toggleRow = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(prev => prev.size === rows.length ? new Set() : new Set(rows.map((_, i) => i)));
  };

  const handleImport = async () => {
    const toImport = rows.filter((_, i) => selected.has(i));
    if (!toImport.length) return;

    setImporting(true);
    const res: ImportResult[] = [];

    for (const row of toImport) {
      try {
        await clientsApi.create({
          name: row.name,
          taxId: row.taxId || undefined,
          addressLine1: row.addressLine1 || undefined,
          city: row.city || undefined,
          phone: row.phone || undefined,
          email: row.email || undefined,
        });
        res.push({ name: row.name, status: 'ok' });
      } catch (err: any) {
        const msg = err?.response?.data?.error || err?.message || 'Błąd';
        res.push({ name: row.name, status: 'error', message: msg });
      }
    }

    setResults(res);
    setImporting(false);
    setDone(true);
    if (res.some(r => r.status === 'ok')) onSuccess();
  };

  const handleClose = () => {
    setRows([]);
    setSelected(new Set());
    setResults([]);
    setDone(false);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  const okCount = results.filter(r => r.status === 'ok').length;
  const errCount = results.filter(r => r.status === 'error').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Import klientów — Subiekt 123</h2>
            <p className="text-xs text-gray-400 mt-0.5">Plik CSV z separatorem średnik (;)</p>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* File picker */}
          {!done && (
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
            >
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
              <FileText className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              {fileName ? (
                <p className="text-sm font-medium text-indigo-600">{fileName}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-700">Kliknij aby wybrać plik CSV</p>
                  <p className="text-xs text-gray-400 mt-1">Eksport z Subiekt 123 → Kontrahenci → Eksport do CSV</p>
                </>
              )}
            </div>
          )}

          {/* Preview table */}
          {rows.length > 0 && !done && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-700">
                  Znaleziono {rows.length} rekordów — zaznaczono {selected.size}
                </p>
                <button onClick={toggleAll} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                  {selected.size === rows.length ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
                </button>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="w-8 px-3 py-2"></th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Nazwa</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">NIP</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Miasto</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Telefon</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((row, i) => (
                        <tr
                          key={i}
                          onClick={() => toggleRow(i)}
                          className={`cursor-pointer transition-colors ${
                            selected.has(i) ? 'bg-white' : 'bg-gray-50 opacity-50'
                          }`}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selected.has(i)}
                              onChange={() => toggleRow(i)}
                              onClick={e => e.stopPropagation()}
                              className="rounded border-gray-300 text-indigo-600"
                            />
                          </td>
                          <td className="px-3 py-2 max-w-[200px]">
                            <div className="truncate font-medium text-gray-900">{row.name}</div>
                            <div className="text-gray-400">{row.type}</div>
                          </td>
                          <td className="px-3 py-2 text-gray-600">{row.taxId || '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{row.city || '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{row.phone || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {done && (
            <div className="space-y-3">
              <div className="flex gap-4">
                <div className="flex items-center gap-2 px-4 py-3 bg-green-50 rounded-xl flex-1">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="text-lg font-bold text-green-700">{okCount}</div>
                    <div className="text-xs text-green-600">Zaimportowano</div>
                  </div>
                </div>
                {errCount > 0 && (
                  <div className="flex items-center gap-2 px-4 py-3 bg-red-50 rounded-xl flex-1">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <div>
                      <div className="text-lg font-bold text-red-700">{errCount}</div>
                      <div className="text-xs text-red-600">Błędy</div>
                    </div>
                  </div>
                )}
              </div>
              {errCount > 0 && (
                <div className="border border-red-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {results.filter(r => r.status === 'error').map((r, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2 text-xs border-b border-red-100 last:border-0">
                      <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium text-gray-800">{r.name}</span>
                        <span className="text-red-500 ml-2">{r.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <button onClick={handleClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            {done ? 'Zamknij' : 'Anuluj'}
          </button>
          {!done && (
            <button
              onClick={handleImport}
              disabled={selected.size === 0 || importing}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Importuję...</>
              ) : (
                <><Upload className="h-4 w-4" /> Importuj {selected.size > 0 ? `(${selected.size})` : ''}</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
