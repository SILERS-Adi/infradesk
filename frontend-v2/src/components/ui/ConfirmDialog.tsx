import * as Dialog from '@radix-ui/react-dialog';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/**
 * Imperative confirm dialog (Radix-based, replacement for window.confirm).
 * Działa również w iframe/embed/mobile gdzie native dialogi są blokowane.
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const cleanup = () => {
      setTimeout(() => {
        try { root.unmount(); } catch { /* noop */ }
        try { container.remove(); } catch { /* noop */ }
      }, 200);
    };
    function Dlg() {
      const [open, setOpen] = useState(true);
      const close = (v: boolean) => {
        setOpen(false);
        resolve(v);
        cleanup();
      };
      return (
        <Dialog.Root open={open} onOpenChange={(o) => { if (!o) close(false); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/60 z-[100] anim-fade" />
            <Dialog.Content
              className="fixed left-1/2 top-1/2 z-[101] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[var(--r-l)] bg-bg border border-bd p-5 shadow-2 anim-scale"
              onEscapeKeyDown={() => close(false)}
            >
              <Dialog.Title className="text-[15px] font-semibold text-tx mb-2">{opts.title}</Dialog.Title>
              {opts.message && (
                <Dialog.Description className="text-[13px] text-tx2 mb-5 leading-relaxed">
                  {opts.message}
                </Dialog.Description>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="px-4 py-2 text-[13px] text-tx2 hover:bg-sf-h rounded-[var(--r-s)] border border-bd"
                  autoFocus
                >
                  {opts.cancelLabel ?? 'Anuluj'}
                </button>
                <button
                  type="button"
                  onClick={() => close(true)}
                  className={`px-4 py-2 text-[13px] rounded-[var(--r-s)] font-medium ${
                    opts.danger
                      ? 'bg-er text-white hover:brightness-110'
                      : 'bg-pri text-white hover:brightness-110'
                  }`}
                >
                  {opts.confirmLabel ?? 'OK'}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      );
    }
    root.render(<Dlg />);
  });
}
