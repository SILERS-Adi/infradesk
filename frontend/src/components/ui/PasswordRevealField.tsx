import { useState } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { copyToClipboard } from '../../utils/helpers';
import toast from 'react-hot-toast';

interface PasswordRevealFieldProps {
  onReveal: () => Promise<string>;
  credentialName?: string;
}

export function PasswordRevealField({ onReveal, credentialName }: PasswordRevealFieldProps) {
  const [password, setPassword] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleReveal = async () => {
    if (password) {
      setShown(v => !v);
      return;
    }
    setLoading(true);
    try {
      const pwd = await onReveal();
      setPassword(pwd);
      setShown(true);
    } catch {
      toast.error('Nie można odsłonić hasła');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!password) return;
    await copyToClipboard(password);
    setCopied(true);
    toast.success(`Hasło${credentialName ? ` (${credentialName})` : ''} skopiowane`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm text-gray-800 min-w-[120px]">
        {shown && password ? password : '••••••••'}
      </span>
      <button
        onClick={handleReveal}
        disabled={loading}
        className="text-gray-400 hover:text-indigo-600 transition-colors p-1"
        title={shown ? 'Ukryj' : 'Pokaż hasło'}
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
      {password && (
        <button
          onClick={handleCopy}
          className="text-gray-400 hover:text-indigo-600 transition-colors p-1"
          title="Kopiuj hasło"
        >
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
