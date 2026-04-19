/**
 * PanelRoutes — /panel/* routing for end clients.
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PanelLayout } from '../../components/panel/PanelLayout';
import { RoleGate } from '../../components/panel/RoleGate';

const PanelTodayPage    = React.lazy(() => import('./PanelTodayPage'));
const PanelSecurityPage = React.lazy(() => import('./PanelSecurityPage'));
const PanelDevicesPage  = React.lazy(() => import('./PanelDevicesPage'));
const PanelTicketsPage  = React.lazy(() => import('./PanelTicketsPage'));
const PanelVaultPage    = React.lazy(() => import('./PanelVaultPage'));
const PanelIdoPage      = React.lazy(() => import('./PanelIdoPage'));

function ComingSoon({ title, phase }: { title: string; phase?: string }) {
  return (
    <div className="panel-glass" style={{ padding: 60, textAlign: 'center' }}>
      <div style={{ fontSize: 12, letterSpacing: '0.2em', color: 'var(--text-tertiary)', fontWeight: 700 }}>
        {phase ?? 'WKRÓTCE'}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8, letterSpacing: '-0.02em' }} className="panel-text-brand">
        {title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 12, maxWidth: 440, margin: '12px auto 0' }}>
        Ten moduł pojawi się w kolejnych fazach wdrożenia ID Panel.
      </div>
    </div>
  );
}

function Lazy({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense fallback={<div className="panel-glass" style={{padding:40,textAlign:'center',color:'var(--text-tertiary)'}}>Ładowanie…</div>}>
      {children}
    </React.Suspense>
  );
}

export default function PanelRoutes() {
  return (
    <Routes>
      <Route element={<PanelLayout />}>
        <Route index element={<Lazy><PanelTodayPage /></Lazy>} />

        <Route path="security" element={
          <RoleGate capability="view_security" fallback={<ComingSoon title="Brak dostępu" />}>
            <Lazy><PanelSecurityPage /></Lazy>
          </RoleGate>
        } />

        <Route path="devices" element={
          <RoleGate capability="view_devices" fallback={<ComingSoon title="Brak dostępu" />}>
            <Lazy><PanelDevicesPage /></Lazy>
          </RoleGate>
        } />

        <Route path="tickets" element={
          <RoleGate capability="view_tickets" fallback={<ComingSoon title="Brak dostępu" />}>
            <Lazy><PanelTicketsPage /></Lazy>
          </RoleGate>
        } />

        <Route path="tickets/new" element={
          <RoleGate capability="create_ticket" fallback={<ComingSoon title="Brak dostępu" />}>
            <Lazy><PanelTicketsPage /></Lazy>
          </RoleGate>
        } />

        <Route path="vault" element={
          <RoleGate capability="view_vault" fallback={<ComingSoon title="Brak dostępu" />}>
            <Lazy><PanelVaultPage /></Lazy>
          </RoleGate>
        } />

        <Route path="ido" element={
          <RoleGate capability="use_ido_chat" fallback={<ComingSoon title="Brak dostępu" />}>
            <Lazy><PanelIdoPage /></Lazy>
          </RoleGate>
        } />

        <Route path="billing" element={
          <RoleGate capability="view_billing" fallback={<ComingSoon title="Brak dostępu" />}>
            <ComingSoon title="Rozliczenia" phase="PHASE 9" />
          </RoleGate>
        } />

        <Route path="*" element={<Navigate to="/panel" replace />} />
      </Route>
    </Routes>
  );
}
