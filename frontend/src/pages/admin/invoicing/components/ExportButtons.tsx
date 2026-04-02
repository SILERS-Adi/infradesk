/**
 * IDS 1.0 — Export Buttons (CSV / Excel)
 * Module-specific component for invoicing exports.
 */

import { Download } from 'lucide-react';
import api from '../../../../api/client';
import type { ExportEntity } from '../types';
import { downloadBlob } from '../utils';
import toast from 'react-hot-toast';

interface ExportButtonsProps {
  entity: ExportEntity;
  params?: Record<string, string>;
  showXlsx?: boolean;
}

async function doExport(entity: string, format: string, params?: Record<string, string>) {
  try {
    const queryParams: Record<string, string> = { format, ...(params || {}) };
    const { data } = await api.get(`/export/${entity}`, { params: queryParams, responseType: 'blob' });
    const ext = format === 'xlsx' ? 'xlsx' : 'csv';
    downloadBlob(data, `${entity}_${new Date().toISOString().slice(0, 10)}.${ext}`);
  } catch {
    toast.error('Eksport nie jest jeszcze dostępny');
  }
}

export function ExportButtons({ entity, params, showXlsx = true }: ExportButtonsProps) {
  const btnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 10px',
    borderRadius: 'var(--rs)',
    border: '1px solid var(--border)',
    background: 'var(--hover-bg)',
    color: 'var(--tm)',
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 500,
    transition: 'var(--trf)',
  };

  return (
    <div style={{ display: 'inline-flex', gap: 4 }}>
      <button
        style={btnStyle}
        onClick={() => doExport(entity, 'csv', params)}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--tm)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
        title="Eksportuj CSV"
      >
        <Download size={13} /> CSV
      </button>
      {showXlsx && (
        <button
          style={btnStyle}
          onClick={() => doExport(entity, 'xlsx', params)}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#4ADE80'; e.currentTarget.style.borderColor = '#4ADE80'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--tm)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          title="Eksportuj Excel"
        >
          <Download size={13} /> Excel
        </button>
      )}
    </div>
  );
}
