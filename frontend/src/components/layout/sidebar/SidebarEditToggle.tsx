import { SlidersHorizontal } from 'lucide-react';
import { useMenuStore } from '../../../store/menuStore';

export function SidebarEditToggle() {
  const isEditMode = useMenuStore(s => s.isEditMode);
  const enterEditMode = useMenuStore(s => s.enterEditMode);

  if (isEditMode) return null;

  return (
    <button
      onClick={enterEditMode}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        padding: '6px 10px',
        marginBottom: 4,
        borderRadius: 8,
        border: '1px dashed var(--border)',
        background: 'transparent',
        color: 'var(--td)',
        fontSize: 10,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = 'var(--accent)';
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.background = 'var(--accent-g, rgba(99,102,241,0.08))';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = 'var(--td)';
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <SlidersHorizontal style={{ width: 12, height: 12 }} />
      Dostosuj menu
    </button>
  );
}
