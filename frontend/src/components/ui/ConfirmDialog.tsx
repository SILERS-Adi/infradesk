import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Usuń', loading }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 'var(--rs)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(248,113,113,0.1)' }}>
          <AlertTriangle style={{ width: 24, height: 24, color: '#F87171' }} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t)' }}>{title}</div>
          <div style={{ fontSize: 13, color: 'var(--tm)', marginTop: 4 }}>{message}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <Button variant="secondary" style={{ flex: 1 }} onClick={onClose} disabled={loading}>Anuluj</Button>
          <Button variant="danger" style={{ flex: 1 }} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
