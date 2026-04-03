import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Building2, User, ArrowRight, Eye, EyeOff, Check, Loader2, Globe } from 'lucide-react';
import { authApi } from '../../api/auth';

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

  const [accountType, setAccountType] = useState<AccountType>('company');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
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

      toast.success('Konto utworzone! Witamy w InfraDesk.');
      window.location.href = '/dashboard'; // Full reload to init auth state
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Błąd rejestracji');
    } finally {
      setLoading(false);
    }
  };

  const ease = 'cubic-bezier(0.16,1,0.3,1)';

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '14px 16px', borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
    color: '#fff', fontSize: 14, fontWeight: 500, outline: 'none',
    transition: 'all 0.2s ease',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 6, display: 'block',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#040a16', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      {/* Background glow */}
      <div style={{ position: 'fixed', top: -200, left: '20%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,70,229,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: -100, right: '10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 480, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <img src="/logo.png" alt="InfraDesk" style={{ height: 60, objectFit: 'contain', marginBottom: 12 }} />
          <div style={{ fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,0.9)', letterSpacing: '-0.02em' }}>Utwórz konto</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>14 dni za darmo — bez karty</div>
        </div>

        {/* Account type toggle */}
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 3, marginBottom: 28, border: '1px solid rgba(255,255,255,0.06)' }}>
          {([
            { id: 'company' as const, label: 'Firma', icon: Building2 },
            { id: 'personal' as const, label: 'Osoba prywatna', icon: User },
          ]).map(t => {
            const sel = accountType === t.id;
            const TI = t.icon;
            return (
              <button key={t.id} onClick={() => setAccountType(t.id)} style={{
                flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none',
                background: sel ? 'rgba(79,70,229,0.2)' : 'transparent',
                color: sel ? '#A5B4FC' : 'rgba(255,255,255,0.4)',
                fontSize: 14, fontWeight: sel ? 700 : 500, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
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
                style={inputStyle} onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }} onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }} />

              <div style={{ marginTop: 16 }}>
                <label style={labelStyle}>Krótka nazwa firmy <span style={{ color: '#EF4444' }}>*</span></label>
                <input value={companyShortName} onChange={e => setCompanyShortName(e.target.value)} placeholder="np. PKS Garwolin" required minLength={3}
                  style={inputStyle} onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }} onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }} />
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
                <label style={labelStyle}>NIP <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 400 }}>(opcjonalnie)</span></label>
                <input value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="np. 8261234567"
                  style={inputStyle} onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }} onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }} />
              </div>
            </div>
          )}

          {/* Personal info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Imię <span style={{ color: '#EF4444' }}>*</span></label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jan" required minLength={2}
                style={inputStyle} onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }} onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }} />
            </div>
            <div>
              <label style={labelStyle}>Nazwisko <span style={{ color: '#EF4444' }}>*</span></label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Kowalski" required minLength={2}
                style={inputStyle} onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }} onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email <span style={{ color: '#EF4444' }}>*</span></label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jan@firma.pl" required
              style={inputStyle} onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }} onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Telefon <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 400 }}>(opcjonalnie)</span></label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+48 500 000 000"
              style={inputStyle} onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }} onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }} />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>Hasło <span style={{ color: '#EF4444' }}>*</span></label>
            <div style={{ position: 'relative' }}>
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 znaków, wielka litera, cyfra, znak specjalny" required minLength={8}
                style={{ ...inputStyle, paddingRight: 44 }}
                onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.4)'; }} onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.08)'; }} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                {showPassword ? <EyeOff size={16} color="rgba(255,255,255,0.3)" /> : <Eye size={16} color="rgba(255,255,255,0.3)" />}
              </button>
            </div>
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
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Masz już konto? </span>
          <Link to="/login" style={{ fontSize: 13, fontWeight: 600, color: '#818CF8', textDecoration: 'none' }}>Zaloguj się</Link>
        </div>

        {isCompany && (
          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.25)', lineHeight: 1.6 }}>
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
