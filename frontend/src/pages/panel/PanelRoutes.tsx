/**
 * PanelRoutes — top-level routing for /panel/*.
 *
 * Layout wraps every child route. Auth & workspace gating is delegated to
 * the parent <Route path="/panel/*"> which is rendered only inside the
 * authenticated branch of App.tsx.
 *
 * Phase 1 ships "Dziś" as the only real page; the rest are intentional
 * "coming soon" stubs so sidebar links don't 404 during development.
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PanelLayout } from '../../components/panel/PanelLayout';
import { RoleGate } from '../../components/panel/RoleGate';

const PanelTodayPage = React.lazy(() => import('./PanelTodayPage'));

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="panel-glass" style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 12, letterSpacing: '0.2em', color: 'var(--text-tertiary)', fontWeight: 700 }}>
        PHASE 2+
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }} className="panel-text-brand">
        {title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 12 }}>
        Ten moduł pojawi się w kolejnych fazach wdrożenia ID Panel.
      </div>
    </div>
  );
}

export default function PanelRoutes() {
  return (
    <Routes>
      <Route element={<PanelLayout />}>
        <Route
          index
          element={
            <React.Suspense fallback={<div style={{ padding: 40, color: 'var(--text-tertiary)' }}>Ładowanie…</div>}>
              <PanelTodayPage />
            </React.Suspense>
          }
        />
        <Route
          path="security"
          element={
            <RoleGate capability="view_security" fallback={<ComingSoon title="Brak dostępu" />}>
              <ComingSoon title="Bezpieczeństwo" />
            </RoleGate>
          }
        />
        <Route
          path="devices"
          element={
            <RoleGate capability="view_devices" fallback={<ComingSoon title="Brak dostępu" />}>
              <ComingSoon title="Urządzenia" />
            </RoleGate>
          }
        />
        <Route
          path="tickets"
          element={
            <RoleGate capability="view_tickets" fallback={<ComingSoon title="Brak dostępu" />}>
              <ComingSoon title="Zgłoszenia" />
            </RoleGate>
          }
        />
        <Route
          path="vault"
          element={
            <RoleGate capability="view_vault" fallback={<ComingSoon title="Brak dostępu" />}>
              <ComingSoon title="Sejf" />
            </RoleGate>
          }
        />
        <Route
          path="billing"
          element={
            <RoleGate capability="view_billing" fallback={<ComingSoon title="Brak dostępu" />}>
              <ComingSoon title="Rozliczenia" />
            </RoleGate>
          }
        />
        <Route path="*" element={<Navigate to="/panel" replace />} />
      </Route>
    </Routes>
  );
}
