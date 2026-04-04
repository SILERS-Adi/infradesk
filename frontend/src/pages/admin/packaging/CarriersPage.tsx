/**
 * IDS 1.0 — PakOps Carriers & Couriers Management
 * Connected to: GET/POST/PATCH/DELETE /api/packaging/carriers/*
 */
import { useState } from 'react';
import {
  Truck, Plus, Edit3, Trash2, ToggleLeft, ToggleRight, Settings, Save,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Modal } from '../../../components/ui/Modal';
import { Alert } from '../../../components/ui/Alert';
import type { CourierEntity, CarrierEntity, ClientConfig } from './types';

type Tab = 'couriers' | 'carriers' | 'config';

export function CarriersPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('couriers');
  const [showCourierForm, setShowCourierForm] = useState(false);
  const [showCarrierForm, setShowCarrierForm] = useState(false);
  const [editingCourier, setEditingCourier] = useState<CourierEntity | null>(null);
  const [editingCarrier, setEditingCarrier] = useState<CarrierEntity | null>(null);

  // Form state — courier
  const [cName, setCName] = useState('');
  const [cLogo, setCLogo] = useState('');
  const [cPickupTime, setCPickupTime] = useState('');
  const [cSaturday, setCSaturday] = useState(false);

  // Form state — carrier
  const [crName, setCrName] = useState('');
  const [crCode, setCrCode] = useState('');
  const [crCourierId, setCrCourierId] = useState('');

  // Queries
  const { data: couriers, isLoading: loadingC, isError: isErrorC } = useQuery<CourierEntity[]>({
    queryKey: ['packaging', 'couriers'],
    queryFn: async () => { const { data } = await api.get('/packaging/carriers/couriers'); return data; },
  });

  const { data: carriers, isLoading: loadingCr, isError: isErrorCr } = useQuery<CarrierEntity[]>({
    queryKey: ['packaging', 'carriers'],
    queryFn: async () => { const { data } = await api.get('/packaging/carriers'); return data; },
  });

  const { data: config } = useQuery<ClientConfig>({
    queryKey: ['packaging', 'carriers', 'config'],
    queryFn: async () => { const { data } = await api.get('/packaging/carriers/client-config'); return data; },
    enabled: tab === 'config',
  });

  const [configForm, setConfigForm] = useState<ClientConfig>({});

  // When config loads, populate form
  const populateConfig = () => {
    if (config) setConfigForm(config);
  };

  // Mutations — Courier
  const saveCourierMut = useMutation({
    mutationFn: async () => {
      const payload = { name: cName, logo: cLogo || undefined, pickupTime: cPickupTime || undefined, saturday: cSaturday };
      if (editingCourier) {
        await api.patch(`/packaging/carriers/couriers/${editingCourier.id}`, payload);
      } else {
        await api.post('/packaging/carriers/couriers', payload);
      }
    },
    onSuccess: () => {
      toast.success(editingCourier ? 'Kurier zaktualizowany' : 'Kurier dodany');
      setShowCourierForm(false);
      setEditingCourier(null);
      queryClient.invalidateQueries({ queryKey: ['packaging', 'couriers'] });
    },
    onError: () => toast.error('Nie udało się zapisać kuriera'),
  });

  const deleteCourierMut = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/packaging/carriers/couriers/${id}`); },
    onSuccess: () => {
      toast.success('Kurier usunięty');
      queryClient.invalidateQueries({ queryKey: ['packaging', 'couriers'] });
    },
    onError: () => toast.error('Nie udało się usunąć'),
  });

  // Mutations — Carrier
  const saveCarrierMut = useMutation({
    mutationFn: async () => {
      const payload = { name: crName, code: crCode, courierId: crCourierId || undefined };
      if (editingCarrier) {
        await api.patch(`/packaging/carriers/${editingCarrier.id}`, payload);
      } else {
        await api.post('/packaging/carriers', payload);
      }
    },
    onSuccess: () => {
      toast.success(editingCarrier ? 'Przewoźnik zaktualizowany' : 'Przewoźnik dodany');
      setShowCarrierForm(false);
      setEditingCarrier(null);
      queryClient.invalidateQueries({ queryKey: ['packaging', 'carriers'] });
    },
    onError: () => toast.error('Nie udało się zapisać przewoźnika'),
  });

  const deleteCarrierMut = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/packaging/carriers/${id}`); },
    onSuccess: () => {
      toast.success('Przewoźnik usunięty');
      queryClient.invalidateQueries({ queryKey: ['packaging', 'carriers'] });
    },
    onError: () => toast.error('Nie udało się usunąć'),
  });

  const toggleCarrierMut = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await api.patch(`/packaging/carriers/${id}`, { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging', 'carriers'] });
    },
    onError: () => toast.error('Nie udało się zmienić statusu'),
  });

  // Config save
  const configMut = useMutation({
    mutationFn: async () => {
      await api.patch('/packaging/carriers/client-config', configForm);
    },
    onSuccess: () => {
      toast.success('Konfiguracja zapisana');
      queryClient.invalidateQueries({ queryKey: ['packaging', 'carriers', 'config'] });
    },
    onError: () => toast.error('Nie udało się zapisać konfiguracji'),
  });

  const openCourierForm = (c?: CourierEntity) => {
    setEditingCourier(c || null);
    setCName(c?.name || '');
    setCLogo(c?.logo || '');
    setCPickupTime(c?.pickupTime || '');
    setCSaturday(c?.saturday || false);
    setShowCourierForm(true);
  };

  const openCarrierForm = (c?: CarrierEntity) => {
    setEditingCarrier(c || null);
    setCrName(c?.name || '');
    setCrCode(c?.code || '');
    setCrCourierId(c?.courierId || '');
    setShowCarrierForm(true);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--hover-bg)',
    color: 'var(--t)', fontSize: 13, outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--td)', textTransform: 'uppercase',
    letterSpacing: '0.06em', marginBottom: 4, display: 'block',
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, transition: 'all .15s',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--tm)',
  });

  return (
    <>
      <PageHeader title="Kurierzy i przewoźnicy" subtitle="Konfiguracja kurierów, przewoźników i adresu nadawczego" />

      <div style={{ padding: '0 24px 24px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, padding: 4, borderRadius: 10, background: 'var(--hover-bg)' }}>
          <button onClick={() => setTab('couriers')} style={tabStyle(tab === 'couriers')}>Kurierzy</button>
          <button onClick={() => setTab('carriers')} style={tabStyle(tab === 'carriers')}>Przewoźnicy</button>
          <button onClick={() => { setTab('config'); populateConfig(); }} style={tabStyle(tab === 'config')}>Konfiguracja</button>
        </div>

        {/* Error state */}
        {(isErrorC || isErrorCr) && (
          <div style={{ marginBottom: 16 }}>
            <Alert type="error">Nie udało się załadować danych</Alert>
          </div>
        )}

        {/* Couriers tab */}
        {tab === 'couriers' && (
          <Card title="Kurierzy" action={
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => openCourierForm()}>Dodaj kuriera</Button>
          } noPadding>
            {loadingC ? <LoadingSpinner /> : !couriers || couriers.length === 0 ? (
              <EmptyState title="Brak kurierów" description="Dodaj pierwszego kuriera."
                action={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => openCourierForm()}>Dodaj kuriera</Button>} />
            ) : (
              <div>
                {couriers.map(c => (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 20px', borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {c.logo ? (
                        <img src={c.logo} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain' }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--hover-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Truck size={16} style={{ color: 'var(--accent)' }} />
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)' }}>{c.name}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 11, color: 'var(--tm)' }}>
                          {c.pickupTime && <span>Odbiór: {c.pickupTime}</span>}
                          {c.saturday && <Badge color="blue">Soboty</Badge>}
                          {c.active ? <Badge color="green">Aktywny</Badge> : <Badge color="gray">Nieaktywny</Badge>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button size="sm" variant="ghost" icon={<Edit3 size={13} />} onClick={() => openCourierForm(c)} />
                      <Button size="sm" variant="danger" icon={<Trash2 size={13} />}
                        loading={deleteCourierMut.isPending}
                        onClick={() => { if (confirm(`Usunąć kuriera "${c.name}"?`)) deleteCourierMut.mutate(c.id); }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Carriers tab */}
        {tab === 'carriers' && (
          <Card title="Przewoźnicy" action={
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => openCarrierForm()}>Dodaj przewoźnika</Button>
          } noPadding>
            {loadingCr ? <LoadingSpinner /> : !carriers || carriers.length === 0 ? (
              <EmptyState title="Brak przewoźników" description="Dodaj pierwszego przewoźnika."
                action={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => openCarrierForm()}>Dodaj przewoźnika</Button>} />
            ) : (
              <div>
                {carriers.map(c => (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 20px', borderBottom: '1px solid var(--border)',
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)' }}>{c.name}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 11, color: 'var(--tm)' }}>
                        <span style={{ fontFamily: 'monospace' }}>{c.code}</span>
                        {c.courierName && <Badge color="indigo">{c.courierName}</Badge>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() => toggleCarrierMut.mutate({ id: c.id, active: !c.active })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.active ? '#059669' : 'var(--tm)', display: 'flex' }}
                        title={c.active ? 'Aktywny' : 'Nieaktywny'}>
                        {c.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                      </button>
                      <Button size="sm" variant="ghost" icon={<Edit3 size={13} />} onClick={() => openCarrierForm(c)} />
                      <Button size="sm" variant="danger" icon={<Trash2 size={13} />}
                        loading={deleteCarrierMut.isPending}
                        onClick={() => { if (confirm(`Usunąć "${c.name}"?`)) deleteCarrierMut.mutate(c.id); }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Config tab */}
        {tab === 'config' && (
          <Card title="Konfiguracja wysyłek" action={
            <Button variant="primary" size="sm" icon={<Save size={14} />}
              loading={configMut.isPending} onClick={() => configMut.mutate()}>Zapisz</Button>
          }>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 700 }}>
              <div>
                <span style={labelStyle}>Nazwa nadawcy</span>
                <input style={inputStyle} value={configForm.senderName || ''} onChange={e => setConfigForm(p => ({ ...p, senderName: e.target.value }))} />
              </div>
              <div>
                <span style={labelStyle}>Email nadawcy</span>
                <input style={inputStyle} value={configForm.senderEmail || ''} onChange={e => setConfigForm(p => ({ ...p, senderEmail: e.target.value }))} />
              </div>
              <div>
                <span style={labelStyle}>Ulica</span>
                <input style={inputStyle} value={configForm.senderStreet || ''} onChange={e => setConfigForm(p => ({ ...p, senderStreet: e.target.value }))} />
              </div>
              <div>
                <span style={labelStyle}>Miasto</span>
                <input style={inputStyle} value={configForm.senderCity || ''} onChange={e => setConfigForm(p => ({ ...p, senderCity: e.target.value }))} />
              </div>
              <div>
                <span style={labelStyle}>Kod pocztowy</span>
                <input style={inputStyle} value={configForm.senderZip || ''} onChange={e => setConfigForm(p => ({ ...p, senderZip: e.target.value }))} />
              </div>
              <div>
                <span style={labelStyle}>Telefon</span>
                <input style={inputStyle} value={configForm.senderPhone || ''} onChange={e => setConfigForm(p => ({ ...p, senderPhone: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', marginBottom: 12 }}>Domyślne wymiary paczki</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                  <div>
                    <span style={labelStyle}>Szerokość (cm)</span>
                    <input type="number" style={inputStyle} value={configForm.defaultWidth || ''} onChange={e => setConfigForm(p => ({ ...p, defaultWidth: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <span style={labelStyle}>Wysokość (cm)</span>
                    <input type="number" style={inputStyle} value={configForm.defaultHeight || ''} onChange={e => setConfigForm(p => ({ ...p, defaultHeight: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <span style={labelStyle}>Głębokość (cm)</span>
                    <input type="number" style={inputStyle} value={configForm.defaultDepth || ''} onChange={e => setConfigForm(p => ({ ...p, defaultDepth: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <span style={labelStyle}>Waga (g)</span>
                    <input type="number" style={inputStyle} value={configForm.defaultWeight || ''} onChange={e => setConfigForm(p => ({ ...p, defaultWeight: Number(e.target.value) }))} />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Courier form modal */}
      <Modal open={showCourierForm} onClose={() => setShowCourierForm(false)}
        title={editingCourier ? 'Edytuj kuriera' : 'Nowy kurier'} size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCourierForm(false)}>Anuluj</Button>
            <Button variant="primary" loading={saveCourierMut.isPending} onClick={() => saveCourierMut.mutate()}>Zapisz</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><span style={labelStyle}>Nazwa *</span><input style={inputStyle} value={cName} onChange={e => setCName(e.target.value)} placeholder="np. InPost" /></div>
          <div><span style={labelStyle}>URL logo</span><input style={inputStyle} value={cLogo} onChange={e => setCLogo(e.target.value)} placeholder="https://..." /></div>
          <div><span style={labelStyle}>Godzina odbioru</span><input style={inputStyle} type="time" value={cPickupTime} onChange={e => setCPickupTime(e.target.value)} /></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={cSaturday} onChange={e => setCSaturday(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            <span style={{ fontSize: 13, color: 'var(--t)' }}>Odbiory w soboty</span>
          </label>
        </div>
      </Modal>

      {/* Carrier form modal */}
      <Modal open={showCarrierForm} onClose={() => setShowCarrierForm(false)}
        title={editingCarrier ? 'Edytuj przewoźnika' : 'Nowy przewoźnik'} size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCarrierForm(false)}>Anuluj</Button>
            <Button variant="primary" loading={saveCarrierMut.isPending} onClick={() => saveCarrierMut.mutate()}>Zapisz</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><span style={labelStyle}>Nazwa *</span><input style={inputStyle} value={crName} onChange={e => setCrName(e.target.value)} placeholder="np. InPost Paczkomaty" /></div>
          <div><span style={labelStyle}>Kod *</span><input style={inputStyle} value={crCode} onChange={e => setCrCode(e.target.value)} placeholder="np. INPOST_LOCKER" /></div>
          <div>
            <span style={labelStyle}>Powiązany kurier</span>
            <select style={{ ...inputStyle, appearance: 'none' }} value={crCourierId} onChange={e => setCrCourierId(e.target.value)}>
              <option value="">— brak —</option>
              {(couriers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default CarriersPage;
