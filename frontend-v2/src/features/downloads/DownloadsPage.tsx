import { useState, useMemo, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Download, Upload, Search, Filter, File, FileText, FileSpreadsheet,
  FileImage, FileArchive, FileCode, Package, Eye, Lock, Globe, Users,
  X, Pencil, Trash2, Loader2, ChevronLeft,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ViewToggle, useViewPreference } from '@/components/ui/ViewToggle';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { formatRelativePl } from '@/lib/utils';

type Visibility = 'INTERNAL' | 'CLIENT' | 'PUBLIC';

interface DownloadFile {
  id: string;
  category: string;
  name: string;
  description: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: string;
  visibility: Visibility;
  targetClientWorkspaceIds: string[];
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
  uploadedBy: { id: string; firstName: string; lastName: string; email: string };
}

interface DownloadsListResponse {
  files: DownloadFile[];
  categories: Array<{ category: string; count: number }>;
  readOnly: boolean;
}

interface ClientOption {
  id: string;
  name: string;
  logoUrl: string | null;
}

interface ClientsListResponse {
  clients: Array<{
    relationId: string;
    client: { id: string; name: string; logoUrl: string | null };
  }>;
}

const VIS_META: Record<Visibility, { label: string; variant: 'warning' | 'info' | 'success'; icon: typeof Lock }> = {
  INTERNAL: { label: 'Wewnętrzne', variant: 'warning', icon: Lock },
  CLIENT:   { label: 'Klient',     variant: 'info',    icon: Users },
  PUBLIC:   { label: 'Publiczne',  variant: 'success', icon: Globe },
};

function iconForMime(mime: string | null, fileName: string): typeof File {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return FileImage;
  if (['zip','7z','tar','gz','rar'].includes(ext)) return FileArchive;
  if (['xlsx','xls','csv'].includes(ext)) return FileSpreadsheet;
  if (['docx','doc','pdf','txt','log'].includes(ext)) return FileText;
  if (['exe','msi','apk','dmg','iso'].includes(ext)) return Package;
  if (['json','xml','ps1','bat','sh'].includes(ext)) return FileCode;
  if ((mime ?? '').startsWith('image/')) return FileImage;
  return File;
}

function humanBytes(bytes: string | number): string {
  const n = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (!isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1_073_741_824) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${(n / 1_073_741_824).toFixed(2)} GB`;
}

export function DownloadsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useViewPreference('downloads', 'visual');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterVisibility, setFilterVisibility] = useState<'' | Visibility>('');
  const [showUpload, setShowUpload] = useState(false);
  const [editFile, setEditFile] = useState<DownloadFile | null>(null);
  const [deleteFile, setDeleteFile] = useState<DownloadFile | null>(null);

  function handleAdd() {
    if (view === 'visual') setShowUpload(true);
    else navigate('/downloads/new');
  }

  // MSP users get full CRUD. Clients are read-only (server confirms via readOnly flag).
  // Backend always enforces — these flags only hide buttons that would 403.
  const canEdit = true;
  const canDelete = true;

  const { data, isLoading } = useQuery<DownloadsListResponse>({
    queryKey: ['downloads', { filterCategory, filterVisibility }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterCategory) params.set('category', filterCategory);
      if (filterVisibility) params.set('visibility', filterVisibility);
      const qs = params.toString();
      return (await api.get(`/downloads${qs ? `?${qs}` : ''}`)).data;
    },
  });

  const files = data?.files ?? [];
  const categories = data?.categories ?? [];
  const readOnly = data?.readOnly ?? false;

  // Load MSP's clients once — needed for target chips + upload/edit multi-select.
  // Client-portal users have readOnly=true and get 403 on /clients; skip fetch there.
  const clientsQ = useQuery<ClientsListResponse>({
    queryKey: ['clients', 'for-downloads'],
    queryFn: async () => (await api.get('/clients')).data,
    enabled: !readOnly,
    staleTime: 5 * 60_000,
  });
  const clientOptions: ClientOption[] = useMemo(
    () => (clientsQ.data?.clients ?? []).map((c) => ({
      id: c.client.id,
      name: c.client.name,
      logoUrl: c.client.logoUrl,
    })),
    [clientsQ.data],
  );
  const clientsById = useMemo(
    () => new Map(clientOptions.map((c) => [c.id, c])),
    [clientOptions],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return files;
    const q = search.toLowerCase();
    return files.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.fileName.toLowerCase().includes(q) ||
        (f.description ?? '').toLowerCase().includes(q),
    );
  }, [files, search]);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/downloads/${id}`)).data,
    onSuccess: () => {
      toast.success('Plik usunięty z Dysku');
      qc.invalidateQueries({ queryKey: ['downloads'] });
      setDeleteFile(null);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd';
      toast.error(msg);
    },
  });

  async function downloadFile(f: DownloadFile) {
    try {
      const res = await api.get(`/downloads/${f.id}/file`, { responseType: 'blob' });
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      qc.invalidateQueries({ queryKey: ['downloads'] });
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd pobierania';
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-5 anim-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-tx">Dysk</h1>
          <p className="text-[13px] text-tx2 mt-0.5">
            Pliki do pobrania dla serwisantów i klientów
            {' · '}
            {filtered.length > 0
              ? `${filtered.length} ${filtered.length === 1 ? 'plik' : 'plików'}`
              : 'brak plików'}
            {categories.length > 0 && ` · ${categories.length} ${categories.length === 1 ? 'kategoria' : 'kategorii'}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle value={view} onChange={setView} />
          {canEdit && !readOnly && (
            <Button onClick={handleAdd}>
              <Upload className="h-4 w-4" /> Dodaj plik do Dysku
            </Button>
          )}
        </div>
      </div>

      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-[2vh] h-3.5 w-3.5 text-tx3" />
            <Input
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="Szukaj po nazwie, opisie, nazwie pliku..."
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-tx3" />
            <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="min-w-[140px]">
              <option value="">Wszystkie kategorie</option>
              {categories.map((c) => (
                <option key={c.category} value={c.category}>{c.category} ({c.count})</option>
              ))}
            </Select>
            <Select
              value={filterVisibility}
              onChange={(e) => setFilterVisibility(e.target.value as '' | Visibility)}
              className="min-w-[140px]"
            >
              <option value="">Każda widoczność</option>
              {!readOnly && <option value="INTERNAL">Wewnętrzne</option>}
              <option value="CLIENT">Klient</option>
              <option value="PUBLIC">Publiczne</option>
            </Select>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Download className="h-10 w-10 mx-auto mb-3 text-tx3" />
          <p className="text-tx font-medium mb-2">
            {files.length === 0 ? 'Dysk jest pusty' : 'Nic nie pasuje do filtrów'}
          </p>
          <p className="text-[13px] text-tx3 mb-4">
            {files.length === 0
              ? 'Dodaj pierwszy instalator, instrukcję lub narzędzie do Dysku.'
              : 'Spróbuj innych kryteriów.'}
          </p>
          {canEdit && !readOnly && files.length === 0 && (
            <Button onClick={handleAdd}>
              <Upload className="h-4 w-4" /> Dodaj plik do Dysku
            </Button>
          )}
        </Card>
      ) : view === 'visual' ? (
        <DownloadsGrid
          files={filtered}
          canEdit={canEdit && !readOnly}
          canDelete={canDelete && !readOnly}
          clientsById={clientsById}
          onEdit={setEditFile}
          onDelete={setDeleteFile}
          onDownload={downloadFile}
        />
      ) : (
        <DownloadsTable
          files={filtered}
          canEdit={canEdit && !readOnly}
          canDelete={canDelete && !readOnly}
          clientsById={clientsById}
          onEdit={setEditFile}
          onDelete={setDeleteFile}
          onDownload={downloadFile}
        />
      )}

      {showUpload && canEdit && !readOnly && (
        <UploadModal
          categories={categories.map((c) => c.category)}
          clientOptions={clientOptions}
          onClose={() => setShowUpload(false)}
        />
      )}
      {editFile && canEdit && !readOnly && (
        <EditModal
          file={editFile}
          categories={categories.map((c) => c.category)}
          clientOptions={clientOptions}
          onClose={() => setEditFile(null)}
        />
      )}
      {deleteFile && (
        <ConfirmDelete
          file={deleteFile}
          busy={deleteMut.isPending}
          onClose={() => setDeleteFile(null)}
          onConfirm={() => deleteMut.mutate(deleteFile.id)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRID / TABLE
// ═══════════════════════════════════════════════════════════════════════════════

function DownloadsGrid({
  files, canEdit, canDelete, clientsById, onEdit, onDelete, onDownload,
}: {
  files: DownloadFile[];
  canEdit: boolean;
  canDelete: boolean;
  clientsById: Map<string, ClientOption>;
  onEdit: (f: DownloadFile) => void;
  onDelete: (f: DownloadFile) => void;
  onDownload: (f: DownloadFile) => void;
}) {
  // group by category
  const groups = useMemo(() => {
    const m = new Map<string, DownloadFile[]>();
    for (const f of files) {
      const arr = m.get(f.category) ?? [];
      arr.push(f);
      m.set(f.category, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [files]);

  return (
    <div className="space-y-6 stg">
      {groups.map(([cat, items]) => (
        <div key={cat}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-[13px] font-bold text-tx">{cat}</h2>
            <Badge variant="neutral">{items.length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((f) => (
              <FileCard
                key={f.id}
                file={f}
                canEdit={canEdit}
                canDelete={canDelete}
                clientsById={clientsById}
                onEdit={() => onEdit(f)}
                onDelete={() => onDelete(f)}
                onDownload={() => onDownload(f)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FileCard({
  file, canEdit, canDelete, clientsById, onEdit, onDelete, onDownload,
}: {
  file: DownloadFile;
  canEdit: boolean;
  canDelete: boolean;
  clientsById: Map<string, ClientOption>;
  onEdit: () => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const Icon = iconForMime(file.mimeType, file.fileName);
  const vis = VIS_META[file.visibility];
  const VisIcon = vis.icon;
  const targetNames = file.visibility === 'CLIENT' && file.targetClientWorkspaceIds.length > 0
    ? file.targetClientWorkspaceIds.map((id) => clientsById.get(id)?.name ?? id.slice(0, 8))
    : [];
  const targetChipText = targetNames.length > 0
    ? (targetNames.length <= 2
        ? `Tylko: ${targetNames.join(', ')}`
        : `Tylko: ${targetNames.slice(0, 2).join(', ')} (+${targetNames.length - 2})`)
    : '';
  return (
    <Card className="p-4 flex flex-col">
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
          style={{ background: 'color-mix(in srgb, var(--pri) 12%, transparent)' }}
        >
          <Icon style={{ width: 22, height: 22, color: 'var(--pri)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-semibold text-tx truncate" title={file.name}>{file.name}</h3>
          <p className="text-[10px] text-tx3 truncate mt-0.5 font-mono" title={file.fileName}>{file.fileName}</p>
        </div>
      </div>
      {file.description && (
        <p className="text-[12px] text-tx2 mt-2 line-clamp-2" title={file.description}>{file.description}</p>
      )}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <Badge variant={vis.variant} className="text-[9px]">
          <VisIcon className="h-2.5 w-2.5" /> {vis.label}
        </Badge>
        {targetChipText && (
          <Badge
            variant="info"
            className="text-[9px]"
            title={targetNames.join(', ')}
          >
            <Users className="h-2.5 w-2.5" /> {targetChipText}
          </Badge>
        )}
        <Badge variant="neutral" className="text-[9px]">{humanBytes(file.sizeBytes)}</Badge>
        {file.downloadCount > 0 && (
          <Badge variant="accent" className="text-[9px]">
            <Eye className="h-2.5 w-2.5" /> {file.downloadCount}
          </Badge>
        )}
      </div>
      <div className="mt-3 text-[10px] text-tx3">
        {file.uploadedBy.firstName} {file.uploadedBy.lastName} · {formatRelativePl(file.createdAt)}
      </div>
      <div className="mt-3 pt-3 border-t border-bd flex items-center gap-2">
        <Button size="sm" onClick={onDownload} className="flex-1">
          <Download className="h-3.5 w-3.5" /> Pobierz
        </Button>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={onEdit} title="Edytuj">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button size="sm" variant="ghost" onClick={onDelete} title="Usuń">
            <Trash2 className="h-3.5 w-3.5" style={{ color: 'var(--er)' }} />
          </Button>
        )}
      </div>
    </Card>
  );
}

function DownloadsTable({
  files, canEdit, canDelete, clientsById, onEdit, onDelete, onDownload,
}: {
  files: DownloadFile[];
  canEdit: boolean;
  canDelete: boolean;
  clientsById: Map<string, ClientOption>;
  onEdit: (f: DownloadFile) => void;
  onDelete: (f: DownloadFile) => void;
  onDownload: (f: DownloadFile) => void;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-bd bg-sf2 text-tx3 text-[10px] uppercase tracking-wider">
              <th className="text-left px-3 py-2.5 font-semibold">Nazwa</th>
              <th className="text-left px-3 py-2.5 font-semibold">Kategoria</th>
              <th className="text-left px-3 py-2.5 font-semibold">Widoczność</th>
              <th className="text-right px-3 py-2.5 font-semibold">Rozmiar</th>
              <th className="text-right px-3 py-2.5 font-semibold">Pobrań</th>
              <th className="text-left px-3 py-2.5 font-semibold">Przesłane</th>
              <th className="text-right px-3 py-2.5 font-semibold">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => {
              const Icon = iconForMime(f.mimeType, f.fileName);
              const vis = VIS_META[f.visibility];
              return (
                <tr key={f.id} className="border-b border-bd hover:bg-sf-h">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Icon style={{ width: 16, height: 16, color: 'var(--pri)' }} />
                      <div className="min-w-0">
                        <p className="font-semibold text-tx truncate max-w-[240px]" title={f.name}>{f.name}</p>
                        <p className="text-[10px] text-tx3 truncate max-w-[240px] font-mono">{f.fileName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-tx2">{f.category}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant={vis.variant} className="text-[9px]">{vis.label}</Badge>
                      {f.visibility === 'CLIENT' && f.targetClientWorkspaceIds.length > 0 && (
                        <Badge
                          variant="info"
                          className="text-[9px]"
                          title={f.targetClientWorkspaceIds.map((id) => clientsById.get(id)?.name ?? id.slice(0, 8)).join(', ')}
                        >
                          <Users className="h-2.5 w-2.5" /> {`Tylko: ${f.targetClientWorkspaceIds.length} ${f.targetClientWorkspaceIds.length === 1 ? 'klient' : 'klientów'}`}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-tx2 tabular-nums">{humanBytes(f.sizeBytes)}</td>
                  <td className="px-3 py-2.5 text-right text-tx2 tabular-nums">{f.downloadCount}</td>
                  <td className="px-3 py-2.5 text-tx3 text-[11px]">
                    {f.uploadedBy.firstName} {f.uploadedBy.lastName}<br/>
                    <span className="text-[10px]">{formatRelativePl(f.createdAt)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => onDownload(f)} className="p-1.5 rounded-[6px] hover:bg-sf-h" title="Pobierz">
                        <Download size={13} />
                      </button>
                      {canEdit && (
                        <button onClick={() => onEdit(f)} className="p-1.5 rounded-[6px] hover:bg-sf-h" title="Edytuj">
                          <Pencil size={13} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => onDelete(f)} className="p-1.5 rounded-[6px] hover:bg-sf-h" title="Usuń">
                          <Trash2 size={13} style={{ color: 'var(--er)' }} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════════════════════════

const MODAL_SHELL: React.CSSProperties = {
  position: 'fixed', inset: 0, margin: 'auto', height: 'fit-content',
  zIndex: 51, width: '95vw', maxWidth: 540, maxHeight: '90vh',
  background: 'var(--sf)', border: '1px solid var(--bd)',
  borderRadius: 'var(--r-m)', display: 'flex', flexDirection: 'column',
};

const MODAL_BODY: React.CSSProperties = {
  padding: '1.5rem', overflowY: 'auto', flex: 1,
};

function UploadModal({
  categories, clientOptions, onClose,
}: {
  categories: string[];
  clientOptions: ClientOption[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[0] ?? 'Instalatory');
  const [visibility, setVisibility] = useState<Visibility>('INTERNAL');
  const [targetIds, setTargetIds] = useState<string[]>([]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Wybierz plik');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', name || file.name);
      fd.append('description', description);
      fd.append('category', category);
      fd.append('visibility', visibility);
      // Backend ignores target IDs for non-CLIENT; still safe to always send.
      fd.append(
        'targetClientWorkspaceIds',
        JSON.stringify(visibility === 'CLIENT' ? targetIds : []),
      );
      return (await api.post('/downloads', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })).data;
    },
    onSuccess: () => {
      toast.success('Plik dodany do Dysku');
      qc.invalidateQueries({ queryKey: ['downloads'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
        ?? (err as Error).message ?? 'Błąd';
      toast.error(msg);
    },
  });

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''));
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content style={MODAL_SHELL}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd" style={{ flexShrink: 0 }}>
            <Dialog.Title className="text-[16px] font-bold text-tx flex items-center gap-2">
              <Upload className="h-4 w-4" /> Dodaj plik do Dysku
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
            style={MODAL_BODY}
            className="space-y-4"
          >
            <div>
              <label className="block text-[10px] font-semibold text-tx3 mb-1">Plik (max 500 MB)</label>
              <input
                type="file"
                onChange={onFileChange}
                required
                className="block w-full text-[12px] text-tx file:mr-3 file:py-2 file:px-3 file:rounded-[var(--r-s)] file:border-0 file:text-[12px] file:font-semibold file:bg-sf2 file:text-tx hover:file:bg-sf-h cursor-pointer"
              />
              {file && (
                <p className="text-[11px] text-tx3 mt-1">
                  {file.name} — {humanBytes(file.size)}
                </p>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-tx3 mb-1">Nazwa wyświetlana</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. TeamViewer Host 15" maxLength={200} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-tx3 mb-1">Opis (opcjonalnie)</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Co to jest, do czego służy..."
                rows={3}
                maxLength={2000}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Kategoria</label>
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  list="categories-datalist"
                  placeholder="np. Instalatory"
                  maxLength={80}
                  required
                />
                <datalist id="categories-datalist">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Widoczność</label>
                <Select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
                  <option value="INTERNAL">Wewnętrzne (tylko serwisanci)</option>
                  <option value="CLIENT">Klient (też klienci)</option>
                  <option value="PUBLIC">Publiczne (wszyscy)</option>
                </Select>
              </div>
            </div>
            {visibility === 'CLIENT' && (
              <ClientTargetPicker
                clientOptions={clientOptions}
                value={targetIds}
                onChange={setTargetIds}
              />
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={mut.isPending}>Anuluj</Button>
              <Button type="submit" disabled={!file || mut.isPending}>
                {mut.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Wysyłanie...</> : <><Upload className="h-3.5 w-3.5" /> Dodaj</>}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ClientTargetPicker({
  clientOptions, value, onChange,
}: {
  clientOptions: ClientOption[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const selected = new Set(value);
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(Array.from(next));
  }
  return (
    <div>
      <label className="block text-[10px] font-semibold text-tx3 mb-1">
        Widoczne dla klientów
      </label>
      <p className="text-[11px] text-tx3 mb-2">
        Puste = wszyscy. Zaznacz aby ograniczyć do wybranych.
      </p>
      {clientOptions.length === 0 ? (
        <div className="text-[12px] text-tx3 bg-sf2 p-3 rounded-[var(--r-s)]">
          Brak klientów do wyboru.
        </div>
      ) : (
        <div className="border border-bd rounded-[var(--r-s)] bg-sf2 max-h-[220px] overflow-y-auto divide-y divide-bd">
          {clientOptions.map((c) => {
            const checked = selected.has(c.id);
            return (
              <label
                key={c.id}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-sf-h"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(c.id)}
                  className="h-3.5 w-3.5 shrink-0"
                />
                {c.logoUrl ? (
                  <img src={c.logoUrl} alt="" className="h-5 w-5 rounded object-contain shrink-0" />
                ) : (
                  <div
                    className="h-5 w-5 rounded flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                    style={{ background: 'var(--pri)' }}
                  >
                    {c.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="text-[12px] text-tx truncate flex-1">{c.name}</span>
              </label>
            );
          })}
        </div>
      )}
      {value.length > 0 && (
        <p className="text-[11px] text-tx2 mt-1">
          Wybrano: {value.length} {value.length === 1 ? 'klient' : 'klientów'}
        </p>
      )}
    </div>
  );
}

function EditModal({
  file, categories, clientOptions, onClose,
}: {
  file: DownloadFile;
  categories: string[];
  clientOptions: ClientOption[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(file.name);
  const [description, setDescription] = useState(file.description ?? '');
  const [category, setCategory] = useState(file.category);
  const [visibility, setVisibility] = useState<Visibility>(file.visibility);
  const [targetIds, setTargetIds] = useState<string[]>(file.targetClientWorkspaceIds ?? []);

  const mut = useMutation({
    mutationFn: async () => (await api.patch(`/downloads/${file.id}`, {
      name,
      description: description.trim() || null,
      category,
      visibility,
      targetClientWorkspaceIds: visibility === 'CLIENT' ? targetIds : [],
    })).data,
    onSuccess: () => {
      toast.success('Zapisano');
      qc.invalidateQueries({ queryKey: ['downloads'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Błąd';
      toast.error(msg);
    },
  });

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content style={MODAL_SHELL}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-bd" style={{ flexShrink: 0 }}>
            <Dialog.Title className="text-[16px] font-bold text-tx flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Edytuj plik na Dysku
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 rounded-[var(--r-s)] text-tx3 hover:bg-sf-h"><X className="h-4 w-4" /></button>
            </Dialog.Close>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
            style={MODAL_BODY}
            className="space-y-4"
          >
            <div>
              <label className="block text-[10px] font-semibold text-tx3 mb-1">Nazwa</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-tx3 mb-1">Opis</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={2000}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Kategoria</label>
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  list="edit-categories-datalist"
                  maxLength={80}
                  required
                />
                <datalist id="edit-categories-datalist">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-tx3 mb-1">Widoczność</label>
                <Select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
                  <option value="INTERNAL">Wewnętrzne</option>
                  <option value="CLIENT">Klient</option>
                  <option value="PUBLIC">Publiczne</option>
                </Select>
              </div>
            </div>
            {visibility === 'CLIENT' && (
              <ClientTargetPicker
                clientOptions={clientOptions}
                value={targetIds}
                onChange={setTargetIds}
              />
            )}
            <div className="text-[11px] text-tx3 bg-sf2 p-3 rounded-[var(--r-s)]">
              Plik: <span className="font-mono">{file.fileName}</span> · {humanBytes(file.sizeBytes)}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={mut.isPending}>Anuluj</Button>
              <Button type="submit" disabled={mut.isPending}>
                {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Zapisz'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ConfirmDelete({
  file, busy, onClose, onConfirm,
}: {
  file: DownloadFile; busy: boolean; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content style={{ ...MODAL_SHELL, maxWidth: 420 }}>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-[var(--r-s)] flex items-center justify-center shrink-0"
                   style={{ background: 'var(--er-l)' }}>
                <Trash2 style={{ color: 'var(--er)', width: 18, height: 18 }} />
              </div>
              <Dialog.Title className="text-[15px] font-bold text-tx">Usunąć plik z Dysku?</Dialog.Title>
            </div>
            <p className="text-[13px] text-tx2 mb-4">
              Usuwasz <strong className="text-tx">{file.name}</strong> ({file.fileName}).
              Można cofnąć z poziomu bazy — plik na dysku pozostaje.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy}>Anuluj</Button>
              <Button
                onClick={onConfirm}
                disabled={busy}
                style={{ background: 'var(--er)', color: 'white' }}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Trash2 className="h-3.5 w-3.5" /> Usuń</>}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DownloadNewPage() {
  const navigate = useNavigate();
  const { data } = useQuery<DownloadsListResponse>({
    queryKey: ['downloads', { filterCategory: '', filterVisibility: '' }],
    queryFn: async () => (await api.get('/downloads')).data,
  });
  const clientsQ = useQuery<ClientsListResponse>({
    queryKey: ['clients', 'for-downloads'],
    queryFn: async () => (await api.get('/clients')).data,
    enabled: !(data?.readOnly ?? false),
    staleTime: 5 * 60_000,
  });
  const clientOptions: ClientOption[] = useMemo(
    () => (clientsQ.data?.clients ?? []).map((c) => ({
      id: c.client.id,
      name: c.client.name,
      logoUrl: c.client.logoUrl,
    })),
    [clientsQ.data],
  );
  return (
    <div className="anim-up">
      <div className="max-w-xl mx-auto mb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-tx3 text-sm hover:text-tx press"
        >
          <ChevronLeft className="h-4 w-4" /> Wstecz
        </button>
      </div>
      <UploadModal
        categories={(data?.categories ?? []).map((c) => c.category)}
        clientOptions={clientOptions}
        onClose={() => navigate('/downloads')}
      />
    </div>
  );
}
