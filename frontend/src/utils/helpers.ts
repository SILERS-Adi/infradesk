import { format, formatDistanceToNow, isPast } from 'date-fns';
import { pl } from 'date-fns/locale';

export function formatDate(date: string | Date | undefined | null, pattern = 'dd.MM.yyyy'): string {
  if (!date) return '—';
  return format(new Date(date), pattern);
}

export function formatDateTime(date: string | Date | undefined | null): string {
  if (!date) return '—';
  return format(new Date(date), 'dd.MM.yyyy HH:mm');
}

export function timeAgo(date: string | Date | undefined | null): string {
  if (!date) return '—';
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: pl });
}

export function isExpired(date: string | Date | undefined | null): boolean {
  if (!date) return false;
  return isPast(new Date(date));
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

export function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as { response?: { data?: { message?: string; error?: string; details?: { field: string; message: string }[] } } };
    const data = axiosError.response?.data;
    if (data?.details?.length) {
      return data.details.map(d => `${d.field}: ${d.message}`).join(', ');
    }
    return data?.message ?? data?.error ?? 'Wystąpił błąd';
  }
  if (error instanceof Error) return error.message;
  return 'Wystąpił błąd';
}
