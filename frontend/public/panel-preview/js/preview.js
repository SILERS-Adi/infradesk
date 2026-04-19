/* ═══════════════════════════════════════════════════════════
   Preview page interactive bits: theme, density, role switch
   ═══════════════════════════════════════════════════════════ */

const STORAGE_THEME = 'idpanel-theme';
const STORAGE_DENSITY = 'idpanel-density';
const STORAGE_ROLE = 'idpanel-role';

function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'auto') {
    root.removeAttribute('data-theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    root.setAttribute('data-theme', prefersLight ? 'light' : 'dark');
  } else {
    root.setAttribute('data-theme', mode);
  }
  localStorage.setItem(STORAGE_THEME, mode);
  document.querySelectorAll('[data-theme-opt]').forEach(el => {
    el.setAttribute('aria-pressed', String(el.dataset.themeOpt === mode));
  });
}

function applyDensity(mode) {
  document.documentElement.setAttribute('data-density', mode);
  localStorage.setItem(STORAGE_DENSITY, mode);
  document.querySelectorAll('[data-density-opt]').forEach(el => {
    el.setAttribute('aria-pressed', String(el.dataset.densityOpt === mode));
  });
}

function applyRole(role) {
  document.documentElement.setAttribute('data-role', role);
  localStorage.setItem(STORAGE_ROLE, role);
  document.querySelectorAll('[data-role-opt]').forEach(el => {
    el.setAttribute('aria-pressed', String(el.dataset.roleOpt === role));
  });
  document.querySelectorAll('[data-role-show]').forEach(el => {
    const allowed = el.dataset.roleShow.split(/\s+/);
    el.style.display = allowed.includes(role) ? '' : 'none';
  });
  /* Role-specific panel content swap */
  const greet = document.querySelector('[data-role-greet]');
  if (greet) {
    const content = {
      msp:    { title: 'Dzień dobry, <em>Adrian</em>', sub: 'Wszyscy klienci — 12 firm, 187 urządzeń online', score: 88, alerts: 6, devices: 187 },
      owner:  { title: 'Dzień dobry, <em>Jan</em>',    sub: 'METBUD · 8 pracowników · 12 urządzeń',       score: 76, alerts: 3, devices: 12  },
      admin:  { title: 'Dzień dobry, <em>Marcin</em>', sub: 'METBUD · zarządzanie techniczne',             score: 76, alerts: 3, devices: 12  },
      member: { title: 'Dzień dobry, <em>Anna</em>',    sub: 'Twój komputer: DESKTOP-ANNAK',                score: 94, alerts: 0, devices: 1   },
    }[role];
    if (content) {
      greet.innerHTML = content.title;
      const sub = document.querySelector('[data-role-sub]'); if (sub) sub.textContent = content.sub;
      if (window.__pulsInstance) {
        window.__pulsInstance.devicesCount = content.devices;
        window.__pulsInstance.alertsCount = content.alerts;
        window.__pulsInstance.deviceStates = Array.from({ length: content.devices }, (_, i) =>
          i < content.alerts ? (i < content.alerts / 2 ? 'bad' : 'warn') : 'ok'
        );
        window.__pulsInstance.setScore(content.score);
      }
    }
  }
}

function init() {
  /* Theme */
  const savedTheme = localStorage.getItem(STORAGE_THEME) || 'dark';
  applyTheme(savedTheme);
  document.querySelectorAll('[data-theme-opt]').forEach(el => {
    el.addEventListener('click', () => applyTheme(el.dataset.themeOpt));
  });

  /* Density */
  const savedDensity = localStorage.getItem(STORAGE_DENSITY) || 'comfortable';
  applyDensity(savedDensity);
  document.querySelectorAll('[data-density-opt]').forEach(el => {
    el.addEventListener('click', () => applyDensity(el.dataset.densityOpt));
  });

  /* Role (preview only) */
  const savedRole = localStorage.getItem(STORAGE_ROLE) || 'owner';
  applyRole(savedRole);
  document.querySelectorAll('[data-role-opt]').forEach(el => {
    el.addEventListener('click', () => applyRole(el.dataset.roleOpt));
  });

  /* Command palette demo */
  document.querySelectorAll('[data-cmd-trigger]').forEach(el => {
    el.addEventListener('click', () => {
      alert('Cmd+K palette — w realnej wersji tutaj otwiera się wyszukiwarka akcji');
    });
  });

  /* Keyboard Cmd+K or Ctrl+K */
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const btn = document.querySelector('[data-cmd-trigger]');
      if (btn) btn.click();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

/* React to OS theme change when in auto mode */
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (localStorage.getItem(STORAGE_THEME) === 'auto') applyTheme('auto');
});
