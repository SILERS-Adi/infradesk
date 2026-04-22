import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { X, FileText, Wand2, Sparkles } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/utils';

const MODAL_SHELL_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 50,
  width: 'min(96vw, 48rem)',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--sf)',
  border: '1px solid var(--bd)',
  borderRadius: 'var(--r)',
  boxShadow: 'var(--sh4)',
  overflow: 'hidden',
};

interface AddThreeWaysProps {
  title: string;
  trigger: ReactNode;
  formTab: ReactNode;      // power-user form
  wizardTab: ReactNode;    // step-by-step for new users
  aiTab: ReactNode;        // "wklej email / opisz czego chcesz" → Iris tworzy draft
  defaultTab?: 'form' | 'wizard' | 'ai';
}

/**
 * 3-way "Add X" modal. User preference kept in localStorage per-context.
 * Reference: feedback_ux_dual_view.md (2026-04-21).
 */
export function AddThreeWays({ title, trigger, formTab, wizardTab, aiTab, defaultTab = 'form' }: AddThreeWaysProps) {
  const [open, setOpen] = useState(false);
  const storageKey = `idesk-add-default:${title}`;
  const stored = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
  const [tab, setTab] = useState<string>(stored ?? defaultTab);

  const handleTabChange = (value: string) => {
    setTab(value);
    window.localStorage.setItem(storageKey, value);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content style={MODAL_SHELL_STYLE}>
          <div className="flex items-center justify-between border-b border-bd px-5 py-4" style={{ flexShrink: 0 }}>
            <Dialog.Title className="text-lg font-semibold text-tx">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Zamknij"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>
          <Tabs.Root value={tab} onValueChange={handleTabChange} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
            <Tabs.List className="flex border-b border-bd px-5 bg-sf2/40" style={{ flexShrink: 0 }}>
              <TabButton value="form" icon={<FileText className="h-4 w-4" />}>Formularz</TabButton>
              <TabButton value="wizard" icon={<Wand2 className="h-4 w-4" />}>Wizard</TabButton>
              <TabButton value="ai" icon={<Sparkles className="h-4 w-4" />}>Z AI</TabButton>
            </Tabs.List>
            <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '20px' }}>
              <Tabs.Content value="form">{formTab}</Tabs.Content>
              <Tabs.Content value="wizard">{wizardTab}</Tabs.Content>
              <Tabs.Content value="ai">{aiTab}</Tabs.Content>
            </div>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TabButton({ value, icon, children }: { value: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Tabs.Trigger
      value={value}
      className={cn(
        'flex items-center gap-2 px-4 py-3 text-sm text-tx3',
        'data-[state=active]:text-tx data-[state=active]:border-b-2 data-[state=active]:border-[var(--bd-f)]',
      )}
    >
      {icon}{children}
    </Tabs.Trigger>
  );
}
