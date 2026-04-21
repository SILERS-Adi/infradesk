import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { X, FileText, Wand2, Sparkles } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/utils';

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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2',
            'rounded-[var(--r)] bg-surface border border-border shadow-2xl animate-fade-in',
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <Dialog.Title className="text-lg font-semibold text-t">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Zamknij"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>
          <Tabs.Root value={tab} onValueChange={handleTabChange}>
            <Tabs.List className="flex border-b border-border px-5 bg-bg2/40">
              <TabButton value="form" icon={<FileText className="h-4 w-4" />}>Formularz</TabButton>
              <TabButton value="wizard" icon={<Wand2 className="h-4 w-4" />}>Wizard</TabButton>
              <TabButton value="ai" icon={<Sparkles className="h-4 w-4" />}>Z AI</TabButton>
            </Tabs.List>
            <div className="p-5 max-h-[70vh] overflow-y-auto">
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
        'flex items-center gap-2 px-4 py-3 text-sm text-tm',
        'data-[state=active]:text-t data-[state=active]:border-b-2 data-[state=active]:border-accent',
      )}
    >
      {icon}{children}
    </Tabs.Trigger>
  );
}
