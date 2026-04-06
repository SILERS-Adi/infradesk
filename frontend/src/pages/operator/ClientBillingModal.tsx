import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Clock, Upload, FileText, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../api/client';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

interface ClientBillingModalProps {
  open: boolean;
  onClose: () => void;
  relationId: string;
  clientName: string;
}

type BillingType = 'subscription' | 'hourly';

interface BillingForm {
  billingType: BillingType;
  subscriptionAmount: number | '';
  includedHours: number | '';
  overageRate: number | '';
  hourlyRate: number | '';
  billingIncrement: number;
  contractFileUrl: string;
}

const INCREMENT_OPTIONS = [1, 5, 10, 15, 30, 60];

const cardStyle = (selected: boolean): React.CSSProperties => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  padding: '18px 14px',
  borderRadius: 12,
  border: selected ? '2px solid var(--accent)' : '1px solid var(--border)',
  background: selected ? 'rgba(99,102,241,0.06)' : 'var(--bg-card)',
  cursor: 'pointer',
  transition: 'all var(--ts)',
});

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--tm)',
  marginBottom: 4,
};

const inputWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

export default function ClientBillingModal({ open, onClose, relationId, clientName }: ClientBillingModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<BillingForm>({
    billingType: 'subscription',
    subscriptionAmount: '',
    includedHours: '',
    overageRate: '',
    hourlyRate: '',
    billingIncrement: 15,
    contractFileUrl: '',
  });
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['workspace-relation', relationId],
    queryFn: () => apiClient.get(`/workspace-relations/${relationId}`).then(r => r.data),
    enabled: open && !!relationId,
  });

  // Populate form when data loads
  useEffect(() => {
    if (!data) return;
    setForm({
      billingType: data.billingType === 'hourly' ? 'hourly' : 'subscription',
      subscriptionAmount: data.subscriptionAmount ?? '',
      includedHours: data.includedHours ?? '',
      overageRate: data.overageRate ?? '',
      hourlyRate: data.hourlyRate ?? '',
      billingIncrement: data.billingIncrement ?? 15,
      contractFileUrl: data.contractFileUrl ?? '',
    });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.patch(`/workspace-relations/${relationId}`, payload).then(r => r.data),
    onSuccess: () => {
      toast.success('Ustawienia rozliczeń zapisane');
      queryClient.invalidateQueries({ queryKey: ['workspace-relation', relationId] });
      queryClient.invalidateQueries({ queryKey: ['operator'] });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? 'Błąd zapisu ustawień');
    },
  });

  const handleSave = () => {
    const payload: Record<string, unknown> = {
      billingType: form.billingType,
      billingIncrement: form.billingIncrement,
      contractFileUrl: form.contractFileUrl || null,
    };

    if (form.billingType === 'subscription') {
      payload.subscriptionAmount = form.subscriptionAmount === '' ? null : Number(form.subscriptionAmount);
      payload.includedHours = form.includedHours === '' ? null : Number(form.includedHours);
      payload.overageRate = form.overageRate === '' ? null : Number(form.overageRate);
      payload.hourlyRate = null;
    } else {
      payload.hourlyRate = form.hourlyRate === '' ? null : Number(form.hourlyRate);
      payload.subscriptionAmount = null;
      payload.includedHours = null;
      payload.overageRate = null;
    }

    saveMutation.mutate(payload);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) {
      toast.error('Dozwolone formaty: PDF, JPG, PNG');
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.post('/uploads', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = res.data?.url ?? res.data?.fileUrl ?? '';
      setForm(prev => ({ ...prev, contractFileUrl: url }));
      toast.success('Plik przesłany');
    } catch {
      toast.error('Błąd przesyłania pliku');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const numField = (label: string, value: number | '', onChange: (v: number | '') => void, suffix?: string) => (
    <div style={inputWrapStyle}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          className="input"
          type="number"
          min={0}
          step="0.01"
          value={value}
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          style={{ flex: 1 }}
        />
        {suffix && <span style={{ fontSize: 12, color: 'var(--td)', whiteSpace: 'nowrap' }}>{suffix}</span>}
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={`Rozliczenia — ${clientName}`} size="lg" footer={
      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="secondary" onClick={onClose}>Anuluj</Button>
        <Button variant="primary" loading={saveMutation.isPending} onClick={handleSave} icon={<CheckCircle size={15} />}>
          Zapisz ustawienia
        </Button>
      </div>
    }>
      {isLoading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>Ładowanie...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Billing type selector */}
          <div>
            <label style={{ ...labelStyle, marginBottom: 8, display: 'block' }}>Typ rozliczenia</label>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={cardStyle(form.billingType === 'subscription')} onClick={() => setForm(p => ({ ...p, billingType: 'subscription' }))}>
                <Receipt size={22} color={form.billingType === 'subscription' ? 'var(--accent)' : 'var(--tm)'} />
                <span style={{ fontSize: 13, fontWeight: 600, color: form.billingType === 'subscription' ? 'var(--accent)' : 'var(--t)' }}>Abonament</span>
                <span style={{ fontSize: 11, color: 'var(--td)', textAlign: 'center' }}>Stała opłata miesięczna + godziny w pakiecie</span>
              </div>
              <div style={cardStyle(form.billingType === 'hourly')} onClick={() => setForm(p => ({ ...p, billingType: 'hourly' }))}>
                <Clock size={22} color={form.billingType === 'hourly' ? 'var(--accent)' : 'var(--tm)'} />
                <span style={{ fontSize: 13, fontWeight: 600, color: form.billingType === 'hourly' ? 'var(--accent)' : 'var(--t)' }}>Godzinowy</span>
                <span style={{ fontSize: 11, color: 'var(--td)', textAlign: 'center' }}>Rozliczenie za każdą godzinę pracy</span>
              </div>
            </div>
          </div>

          {/* Subscription fields */}
          {form.billingType === 'subscription' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {numField('Kwota netto / msc', form.subscriptionAmount, v => setForm(p => ({ ...p, subscriptionAmount: v })), 'PLN')}
              {numField('Godziny w abonamencie', form.includedHours, v => setForm(p => ({ ...p, includedHours: v })), 'h')}
              {numField('Stawka po przekroczeniu', form.overageRate, v => setForm(p => ({ ...p, overageRate: v })), 'zł/h')}
              <div style={inputWrapStyle}>
                <label style={labelStyle}>Naliczanie co</label>
                <select
                  className="input"
                  value={form.billingIncrement}
                  onChange={e => setForm(p => ({ ...p, billingIncrement: Number(e.target.value) }))}
                >
                  {INCREMENT_OPTIONS.map(m => (
                    <option key={m} value={m}>{m} min</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Hourly fields */}
          {form.billingType === 'hourly' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {numField('Stawka za godzinę', form.hourlyRate, v => setForm(p => ({ ...p, hourlyRate: v })), 'zł/h')}
              <div style={inputWrapStyle}>
                <label style={labelStyle}>Naliczanie co</label>
                <select
                  className="input"
                  value={form.billingIncrement}
                  onChange={e => setForm(p => ({ ...p, billingIncrement: Number(e.target.value) }))}
                >
                  {INCREMENT_OPTIONS.map(m => (
                    <option key={m} value={m}>{m} min</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Contract file upload */}
          <div>
            <label style={{ ...labelStyle, marginBottom: 8, display: 'block' }}>Skan umowy</label>

            {form.contractFileUrl && (
              <a
                href={form.contractFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: 'var(--accent)',
                  marginBottom: 10,
                  textDecoration: 'none',
                }}
              >
                <FileText size={14} />
                Pobierz aktualny plik
              </a>
            )}

            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '16px 14px',
                borderRadius: 10,
                border: '1px dashed var(--border)',
                background: 'var(--bg-card)',
                cursor: 'pointer',
                transition: 'background var(--ts)',
                fontSize: 13,
                color: 'var(--tm)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card)')}
            >
              <Upload size={16} />
              {uploading ? 'Przesyłanie...' : 'Kliknij, aby przesłać plik (PDF, JPG, PNG)'}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
