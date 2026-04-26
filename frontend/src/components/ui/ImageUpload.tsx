import { useState, useRef } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import api from '../../api/client';

interface ImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  hint?: string;
  size?: number; // px, default 80
  rounded?: boolean;
}

export function ImageUpload({ value, onChange, label, hint, size = 80, rounded }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Maksymalny rozmiar pliku: 5MB'); return; }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onChange(data.url);
    } catch {
      alert('Nie udało się wgrać pliku');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      {label && <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--td)', marginBottom: 6 }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          style={{
            width: size, height: size, borderRadius: rounded ? '50%' : 10,
            border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: uploading ? 'wait' : 'pointer', overflow: 'hidden', position: 'relative',
            background: value ? 'transparent' : 'var(--hover-bg)', transition: 'border-color .2s',
          }}
          onMouseEnter={e => { if (!value) e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          {uploading ? (
            <Loader2 size={20} className="spinning" style={{ color: 'var(--accent)' }} />
          ) : value ? (
            <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Upload size={18} style={{ color: 'var(--td)' }} />
          )}
        </div>
        {value && (
          <button type="button" onClick={() => onChange(null)} style={{
            background: 'none', border: 'none', color: 'var(--td)', cursor: 'pointer', padding: 4,
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#F87171'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--td)'; }}>
            <X size={14} /> Usuń
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFile} style={{ display: 'none' }} />
      </div>
      {hint && <div style={{ fontSize: 10, color: 'var(--td)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
