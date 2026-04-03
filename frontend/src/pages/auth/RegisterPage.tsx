import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Building2, User, ArrowRight, Eye, EyeOff, Check, Loader2, Globe } from 'lucide-react';
import { authApi } from '../../api/auth';
import { useTheme } from '../../store/themeStore';

type AccountType = 'company' | 'personal';

function slugify(text: string): string {
  return text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { resolved } = useTheme();
  const isLight = resolved === 'light';

  const [accountType, setAccountType] = useState<AccountType>('company');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  // Anti-bot
  const [honeypot, setHoneypot] = useState('');
  const [loadedAt] = useState(() => Date.now());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyShortName, setCompanyShortName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [loading, setLoading] = useState(false);
  const [slugPreview, setSlugPreview] = useState('');
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const slugCheckTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Live slug preview + availability check
  useEffect(() => {
    if (accountType !== 'company' || companyShortName.length < 3) {
      setSlugPreview('');
      setSlugAvailable(null);
      return;
    }
    const slug = slugify(companyShortName);
    setSlugPreview(slug);
    setSlugAvailable(null);

    if (slugCheckTimeout.current) clearTimeout(slugCheckTimeout.current);
    slugCheckTimeout.current = setTimeout(async () => {
      try {
        const res = await authApi.checkSlug(slug);
        setSlugPreview(res.slug);
        setSlugAvailable(res.available);
      } catch { setSlugAvailable(null); }
    }, 500);
  }, [companyShortName, accountType]);

  const isCompany = accountType === 'company';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    // Anti-bot: honeypot
    if (honeypot) return;
    // Anti-bot: time trap (form submitted too fast = bot)
    if (Date.now() - loadedAt < 3000) {
      toast.error('Proszę poczekać chwilę przed wysłaniem formularza');
      return;
    }

    if (isCompany && companyShortName.length < 3) {
      toast.error('Krótka nazwa firmy musi mieć min. 3 znaki');
      return;
    }

    setLoading(true);
    try {
      const result = await authApi.register({
        accountType,
        firstName, lastName, email, password, phone: phone || undefined,
        companyName: isCompany ? companyName : undefined,
        companyShortName: isCompany ? companyShortName : undefined,
        taxId: isCompany ? taxId : undefined,
      });

      // Save auth to localStorage — AuthProvider will pick it up on reload
      localStorage.setItem('infradesk_access_token', result.accessToken);
      localStorage.setItem('infradesk_refresh_token', result.refreshToken);
      localStorage.setItem('infradesk_user', JSON.stringify(result.user));
      localStorage.setItem('infradesk_workspace', result.workspace.id);

      // Save configurator config to workspace if available
      const savedConfig = sessionStorage.getItem('infradesk_configurator_config');
      const savedPrice = sessionStorage.getItem('infradesk_configurator_price');
      if (savedConfig) {
        try {
          await fetch('/api/workspaces/save-config', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${result.accessToken}` },
            body: JSON.stringify({
              workspaceId: result.workspace.id,
              config: JSON.parse(savedConfig),
              monthlyPrice: savedPrice ? Number(savedPrice) : 0,
            }),
          });
        } catch {}
        sessionStorage.removeItem('infradesk_configurator_config');
        sessionStorage.removeItem('infradesk_configurator_price');
      }

      toast.success('Konto utworzone! Witamy w InfraDesk.');
      // Redirect: companies → subdomain, personal → main domain
      if (result.workspace.type === 'COMPANY' && result.workspace.slug) {
        window.location.href = `https://${result.workspace.slug}.infradesk.pl/dashboard`;
      } else {
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Błąd rejestracji');
    } finally {
      setLoading(false);
    }
  };

  const ease = 'cubic-bezier(0.16,1,0.3,1)';

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '14px 16px', borderRadius: 12,
    border: '1px solid var(--border)', background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
    color: 'var(--t)', fontSize: 14, fontWeight: 500, outline: 'none',
    transition: 'all 0.2s ease',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: 'var(--ts)', marginBottom: 6, display: 'block',
  };

  const inputFocusBorder = 'rgba(99,102,241,0.4)';
  const inputBlurBorder = 'var(--border)';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--t)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      {/* Background glow */}
      <div style={{ position: 'fixed', top: -200, left: '20%', width: 600, height: 600, borderRadius: '50%', background: `radial-gradient(circle, rgba(79,70,229,${isLight ? '0.04' : '0.06'}) 0%, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: -100, right: '10%', width: 400, height: 400, borderRadius: '50%', background: `radial-gradient(circle, rgba(124,58,237,${isLight ? '0.03' : '0.04'}) 0%, transparent 70%)`, pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 480, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <img src={isLight ? '/logo-dark.png' : '/logo.png'} alt="InfraDesk" style={{ height: 60, objectFit: 'contain', marginBottom: 12 }} />
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t)', letterSpacing: '-0.02em', opacity: 0.9 }}>Utwórz konto</div>
          <div style={{ fontSize: 14, color: 'var(--tm)', marginTop: 4 }}>14 dni za darmo — bez karty</div>
        </div>

        {/* Account type toggle */}
        <div style={{ display: 'flex', gap: 0, background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 3, marginBottom: 28, border: `1px solid var(--border)` }}>
          {([
            { id: 'company' as const, label: 'Firma', icon: Building2 },
            { id: 'personal' as const, label: 'Osoba prywatna', icon: User },
          ]).map(t => {
            const sel = accountType === t.id;
            const TI = t.icon;
            return (
              <button key={t.id} onClick={() => setAccountType(t.id)} style={{
                flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none',
                background: sel ? (isLight ? '#fff' : 'rgba(79,70,229,0.2)') : 'transparent',
                color: sel ? (isLight ? '#4F46E5' : '#A5B4FC') : 'var(--ts)',
                fontSize: 14, fontWeight: sel ? 700 : 500, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: sel && isLight ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: `all 0.25s ${ease}`,
              }}>
                <TI size={16} /> {t.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Company fields */}
          {isCompany && (
            <div style={{ marginBottom: 20, animation: 'regFadeIn 0.3s ease' }}>
              <label style={labelStyle}>Nazwa firmy</label>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="np. PKS Garwolin Sp. z o.o."
                style={inputStyle} onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }} onBlur={e => { e.target.style.borderColor = ''; }} />

              <div style={{ marginTop: 16 }}>
                <label style={labelStyle}>Krótka nazwa firmy <span style={{ color: '#EF4444' }}>*</span></label>
                <input value={companyShortName} onChange={e => setCompanyShortName(e.target.value)} placeholder="np. PKS Garwolin" required minLength={3}
                  style={inputStyle} onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }} onBlur={e => { e.target.style.borderColor = ''; }} />
                {/* Subdomain preview */}
                {slugPreview && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Globe size={13} color="#818CF8" />
                    <span style={{ fontSize: 13, color: '#818CF8', fontWeight: 600, fontFamily: 'monospace' }}>
                      {slugPreview}.infradesk.pl
                    </span>
                    {slugAvailable === true && <Check size={14} color="#10B981" />}
                    {slugAvailable === false && <span style={{ fontSize: 11, color: '#EF4444', fontWeight: 600 }}>zajęta</span>}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 16 }}>
                <label style={labelStyle}>NIP <span style={{ color: 'var(--td)', fontWeight: 400 }}>(opcjonalnie)</span></label>
                <input value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="np. 8261234567"
                  style={inputStyle} onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }} onBlur={e => { e.target.style.borderColor = ''; }} />
              </div>
            </div>
          )}

          {/* Personal info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Imię <span style={{ color: '#EF4444' }}>*</span></label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jan" required minLength={2}
                style={inputStyle} onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }} onBlur={e => { e.target.style.borderColor = ''; }} />
            </div>
            <div>
              <label style={labelStyle}>Nazwisko <span style={{ color: '#EF4444' }}>*</span></label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Kowalski" required minLength={2}
                style={inputStyle} onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }} onBlur={e => { e.target.style.borderColor = ''; }} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email <span style={{ color: '#EF4444' }}>*</span></label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jan@firma.pl" required
              style={inputStyle} onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }} onBlur={e => { e.target.style.borderColor = ''; }} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Telefon <span style={{ color: 'var(--td)', fontWeight: 400 }}>(opcjonalnie)</span></label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+48 500 000 000"
              style={inputStyle} onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }} onBlur={e => { e.target.style.borderColor = ''; }} />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>Hasło <span style={{ color: '#EF4444' }}>*</span></label>
            <div style={{ position: 'relative' }}>
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 znaków, wielka litera, cyfra, znak specjalny" required minLength={8}
                style={{ ...inputStyle, paddingRight: 44 }}
                onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }} onBlur={e => { e.target.style.borderColor = ''; }} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                {showPassword ? <EyeOff size={16} color="var(--tm)" /> : <Eye size={16} color="var(--tm)" />}
              </button>
            </div>
            {/* Password strength indicator */}
            {password.length > 0 && (() => {
              const checks = [
                password.length >= 8,
                /[A-Z]/.test(password),
                /[a-z]/.test(password),
                /[0-9]/.test(password),
                /[^A-Za-z0-9]/.test(password),
              ];
              const score = checks.filter(Boolean).length;
              const labels = ['Bardzo słabe', 'Słabe', 'Średnie', 'Dobre', 'Silne', 'Bardzo silne'];
              const colors = ['#EF4444', '#F59E0B', '#F59E0B', '#10B981', '#059669', '#059669'];
              return (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                    {[0,1,2,3,4].map(i => (
                      <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < score ? colors[score] : (isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'), transition: 'all 0.3s ease' }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: colors[score] }}>{labels[score]}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[
                        { ok: password.length >= 8, label: '8+' },
                        { ok: /[A-Z]/.test(password), label: 'A-Z' },
                        { ok: /[0-9]/.test(password), label: '0-9' },
                        { ok: /[^A-Za-z0-9]/.test(password), label: '@#!' },
                      ].map(r => (
                        <span key={r.label} style={{ fontSize: 10, fontWeight: 600, color: r.ok ? '#059669' : 'var(--tm)', transition: 'color 0.2s' }}>
                          {r.ok ? <Check size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> : null} {r.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Honeypot — invisible to users, bots fill it */}
          <div style={{ position: 'absolute', left: -9999, top: -9999, opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
            <input type="text" name="website_url" tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} />
          </div>

          {/* Submit */}
          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '16px 20px', borderRadius: 14, border: 'none',
            background: 'linear-gradient(135deg, #4F46E5, #6D28D9)',
            color: '#fff', fontSize: 16, fontWeight: 750, cursor: loading ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: '0 6px 20px rgba(79,70,229,0.35)',
            transition: `all 0.25s ${ease}`,
            opacity: loading ? 0.7 : 1,
          }}
            onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(79,70,229,0.4)'; } }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(79,70,229,0.35)'; }}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <><span>Utwórz konto</span> <ArrowRight size={18} /></>}
          </button>
        </form>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <span style={{ fontSize: 13, color: 'var(--tm)' }}>Masz już konto? </span>
          <Link to="/login" style={{ fontSize: 13, fontWeight: 600, color: '#818CF8', textDecoration: 'none' }}>Zaloguj się</Link>
        </div>

        {isCompany && (
          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--td)', lineHeight: 1.6 }}>
            Po rejestracji Twoja firma będzie dostępna pod<br />
            <span style={{ color: '#818CF8', fontFamily: 'monospace' }}>{slugPreview || 'nazwafirmy'}.infradesk.pl</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes regFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
