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
      <div className="flex flex-col items-center text-center gap-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl"
          style={{ background: 'rgba(248,113,113,0.1)' }}>
          <AlertTriangle className="h-6 w-6" style={{ color: '#F87171' }} />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-white/85">{title}</h3>
          <p className="mt-1 text-[13px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{message}</p>
        </div>
        <div className="flex gap-2.5 w-full">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={loading}>Anuluj</Button>
          <Button variant="danger" className="flex-1" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
