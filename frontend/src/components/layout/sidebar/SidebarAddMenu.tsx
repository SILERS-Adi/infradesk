import { useState } from 'react';
import { Plus, Minus, FolderPlus, X } from 'lucide-react';
import { useMenuStore } from '../../../store/menuStore';

interface Props {
  afterIndex: number;
}

export function SidebarAddMenu({ afterIndex }: Props) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const addSeparator = useMenuStore(s => s.addSeparator);
  const addCustomGroup = useMenuStore(s => s.addCustomGroup);

  if (naming) {
    return (
      <div style={{
        display: 'flex', gap: 4, padding: '4px 8px', alignItems: 'center',
      }}>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && name.trim()) {
              addCustomGroup(name.trim());
              setName('');
              setNaming(false);
              setOpen(false);
            }
            if (e.key === 'Escape') { setNaming(false); setName(''); }
          }}
          placeholder="Nazwa sekcji..."
          style={{
            flex: 1, padding: '5px 8px', borderRadius: 6, fontSize: 11,
            border: '1px solid var(--accent)', background: 'var(--bg)',
            color: 'var(--t)', outline: 'none',
          }}
        />
        <button
          onClick={() => { if (name.trim()) { addCustomGroup(name.trim()); setName(''); setNaming(false); setOpen(false); } }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', display: 'flex', padding: 2 }}
        >
          <Plus style={{ width: 14, height: 14 }} />
        </button>
        <button
          onClick={() => { setNaming(false); setName(''); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--td)', display: 'flex', padding: 2 }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}>
        <button
          onClick={() => setOpen(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--td)', display: 'flex', alignItems: 'center', padding: 2,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--td)'}
          title="Dodaj sekcję lub separator"
        >
          <Plus style={{ width: 12, height: 12 }} />
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', gap: 4, padding: '3px 8px', justifyContent: 'center',
    }}>
      <button
        onClick={() => setNaming(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
          borderRadius: 6, border: '1px dashed var(--border)', background: 'none',
          color: 'var(--tm)', fontSize: 10, fontWeight: 500, cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--tm)'; }}
      >
        <FolderPlus style={{ width: 11, height: 11 }} />
        Sekcja
      </button>
      <button
        onClick={() => { addSeparator(afterIndex); setOpen(false); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
          borderRadius: 6, border: '1px dashed var(--border)', background: 'none',
          color: 'var(--tm)', fontSize: 10, fontWeight: 500, cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--tm)'; }}
      >
        <Minus style={{ width: 11, height: 11 }} />
        Separator
      </button>
      <button
        onClick={() => setOpen(false)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--td)', display: 'flex', padding: 2 }}
      >
        <X style={{ width: 12, height: 12 }} />
      </button>
    </div>
  );
}
