import { Save, X, RotateCcw, Loader2 } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useMenuStore, useIsDirty } from '../../../store/menuStore';
import { useMenuActions } from '../../../hooks/useMenuPreference';

export function SidebarEditToolbar() {
  const cancelEditMode = useMenuStore(s => s.cancelEditMode);
  const isSaving = useMenuStore(s => s.isSaving);
  const isDirty = useIsDirty();
  const { save, reset } = useMenuActions();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleSave = async () => {
    try {
      await save();
      toast.success('Układ menu zapisany');
    } catch {
      toast.error('Nie udało się zapisać menu');
    }
  };

  const handleReset = async () => {
    try {
      await reset();
      toast.success('Przywrócono domyślne menu');
      setShowResetConfirm(false);
    } catch {
      toast.error('Nie udało się zresetować menu');
    }
  };

  if (showResetConfirm) {
    return (
      <div style={{
        padding: '10px 8px', borderTop: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto',
      }}>
        <p style={{ fontSize: 11, color: 'var(--ts)', textAlign: 'center', margin: 0 }}>
          Przywrócić domyślny układ menu?
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={handleReset} disabled={isSaving}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, background: 'rgba(239,68,68,0.12)', color: '#F87171',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
            {isSaving ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <RotateCcw style={{ width: 12, height: 12 }} />}
            Tak
          </button>
          <button onClick={() => setShowResetConfirm(false)}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid var(--border)',
              background: 'none', color: 'var(--ts)', fontSize: 11, fontWeight: 500, cursor: 'pointer',
            }}>
            Nie
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: '10px 8px', borderTop: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto',
    }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={handleSave} disabled={!isDirty || isSaving}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: isDirty && !isSaving ? 'pointer' : 'default',
            fontSize: 11, fontWeight: 600,
            background: isDirty ? 'var(--accent)' : 'var(--accent-g, rgba(99,102,241,0.08))',
            color: isDirty ? '#fff' : 'var(--td)',
            opacity: isDirty && !isSaving ? 1 : 0.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            transition: 'all 0.15s',
          }}>
          {isSaving ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" /> : <Save style={{ width: 12, height: 12 }} />}
          Zapisz
        </button>
        <button onClick={cancelEditMode}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid var(--border)',
            background: 'none', color: 'var(--ts)', fontSize: 11, fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}>
          <X style={{ width: 12, height: 12 }} />
          Anuluj
        </button>
      </div>
      <button onClick={() => setShowResetConfirm(true)}
        style={{
          width: '100%', padding: '6px 0', borderRadius: 8, border: 'none',
          background: 'transparent', color: 'var(--td)', fontSize: 10, fontWeight: 500, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--ts)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--td)'}
      >
        <RotateCcw style={{ width: 11, height: 11 }} />
        Przywróć domyślne
      </button>
    </div>
  );
}
