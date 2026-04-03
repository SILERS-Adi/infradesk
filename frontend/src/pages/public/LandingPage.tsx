import { Link } from 'react-router-dom';
import { Shield, Monitor, Zap, Users, Download, ChevronRight, Check, Server, User, Building2, ArrowRight, Phone } from 'lucide-react';
import { useTheme } from '../../store/themeStore';

const FEATURES = [
  { icon: Monitor, title: 'Monitoring 24/7', desc: 'CPU, RAM, dysk, temperatura — wszystko w czasie rzeczywistym' },
  { icon: Shield, title: 'Audyt bezpieczeństwa', desc: '20 automatycznych testów: firewall, antywirus, szyfrowanie, aktualizacje' },
  { icon: Zap, title: 'Zdalne zarządzanie', desc: 'RustDesk, Wake-on-LAN, restart usług, aktualizacje Windows' },
  { icon: Users, title: 'Portal klienta', desc: 'Każdy klient ma swój panel do zgłoszeń i podglądu infrastruktury' },
  { icon: Server, title: 'Backup zarządzany', desc: 'Automatyczne kopie SQL i folderów z monitoringiem statusu' },
  { icon: Download, title: 'Agent na każdy komputer', desc: 'Jeden agent — pełna widoczność. Windows, serwery, stacje robocze' },
];

const PLANS = [
  {
    name: 'Personal', type: 'PERSONAL', price: 'Za darmo', desc: 'Dla użytkowników domowych',
    color: '#10B981', features: ['Do 3 urządzeń', 'Monitoring systemu', 'Czyszczenie i optymalizacja', 'Audyt bezpieczeństwa', 'Pomoc zdalna (płatna)'],
  },
  {
    name: 'Business', type: 'BUSINESS', price: 'od 49 zł/mies', desc: 'Dla firm zarządzających własną infra',
    color: '#3B82F6', popular: true, features: ['Nieograniczone urządzenia', 'Zgłoszenia serwisowe', 'Backup zarządzany', 'CRM i rozliczenia', 'Zapraszanie partnerów IT'],
  },
  {
    name: 'MSP', type: 'MSP', price: 'od 149 zł/mies', desc: 'Dla firm IT zarządzających klientami',
    color: '#8B5CF6', features: ['Wszystko z Business', 'Tworzenie kont klientów', 'Kontrola modułów per klient', 'Wielopoziomowe zarządzanie', 'AI diagnostyka'],
  },
];

export default function LandingPage() {
  const { resolved } = useTheme();
  const isLight = resolved === 'light';
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--t)' }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <img src={isLight ? '/logo-dark.png' : '/logo.png'} alt="InfraDesk" style={{ height: 56, objectFit: 'contain' }} />
        </div>
        <div className="flex items-center gap-3">
          <a href="tel:+48575662664" className="hidden md:flex items-center gap-1.5 text-sm transition-colors" style={{ color: 'var(--tm)' }}>
            <Phone className="h-3.5 w-3.5" /> +48 575 662 664
          </a>
          <Link to="/kontakt" className="px-3 py-2 text-sm font-medium transition-colors" style={{ color: 'var(--tm)' }}>Kontakt</Link>
          <Link to="/login" className="px-4 py-2 text-sm font-medium transition-colors" style={{ color: 'var(--ts)' }}>Zaloguj się</Link>
          <Link to="/register" className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' }}>
            Załóż konto
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 md:px-12 py-16 md:py-24 max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-6"
          style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#A78BFA' }}>
          <Zap className="h-3 w-3" /> Platforma do zarządzania infrastrukturą IT
        </div>
        <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
          Zarządzaj infrastrukturą<br />
          <span style={{ background: 'linear-gradient(145deg, #8B5CF6, #3B82F6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            jak profesjonalista
          </span>
        </h1>
        <p className="text-lg md:text-xl max-w-2xl mx-auto mb-10" style={{ color: 'var(--ts)' }}>
          Monitoring, zgłoszenia, zdalne zarządzanie, backup i audyt bezpieczeństwa.
          Dla firm IT, przedsiębiorstw i użytkowników domowych.
        </p>
        <div className="flex items-center justify-center gap-4 mb-10">
          <Link to="/register" className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)', boxShadow: '0 4px 20px rgba(79,140,255,0.3)' }}>
            Rozpocznij za darmo <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Download cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
          <a href="/downloads/Asystent%20InfraDesk.exe"
            className="group rounded-2xl p-5 text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(5,150,105,0.12)' }}>
                <Monitor className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--t)', opacity: 0.85 }}>Asystent Home</div>
                <div className="text-[11px]" style={{ color: 'var(--tm)' }}>v6.0.0 · Windows · Za darmo</div>
              </div>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--tm)' }}>Dla uzykownikow domowych. Diagnostyka, czyszczenie, bezpieczenstwo, naprawa AI, pomoc zdalna.</p>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 group-hover:text-emerald-300 transition-colors">
              <Download className="h-3.5 w-3.5" /> Pobierz · ~40 MB
            </div>
          </a>
          <a href="/downloads/Asystent%20Business.exe"
            className="group rounded-2xl p-5 text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)' }}>
                <Server className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--t)', opacity: 0.85 }}>Asystent Business</div>
                <div className="text-[11px]" style={{ color: 'var(--tm)' }}>v1.0.0 · Windows</div>
              </div>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--tm)' }}>Dla firm. Monitoring, zgloszenia, backup, S.M.A.R.T., RAID, pomoc zdalna, diagnostyka.</p>
            <div className="flex items-center gap-2 text-xs font-medium text-violet-400 group-hover:text-violet-300 transition-colors">
              <Download className="h-3.5 w-3.5" /> Pobierz · ~40 MB
            </div>
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 md:px-12 py-16 max-w-7xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">Wszystko czego potrzebujesz</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(f => (
            <div key={f.title} className="rounded-2xl p-6 transition-all hover:scale-[1.02]"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: 'rgba(139,92,246,0.1)' }}>
                <f.icon className="h-5 w-5 text-violet-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--t)', opacity: 0.85 }}>{f.title}</h3>
              <p className="text-sm" style={{ color: 'var(--tm)' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 md:px-12 py-16 max-w-7xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">Cennik</h2>
        <p className="text-center mb-12" style={{ color: 'var(--tm)' }}>Wybierz plan dopasowany do Twoich potrzeb</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {PLANS.map(p => (
            <div key={p.name} className="rounded-2xl p-6 relative"
              style={{
                background: p.popular ? 'rgba(139,92,246,0.06)' : 'var(--bg-card)',
                border: p.popular ? '2px solid rgba(139,92,246,0.25)' : '1px solid var(--border)',
              }}>
              {p.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)', color: '#fff' }}>
                  Najpopularniejszy
                </div>
              )}
              <h3 className="text-lg font-bold" style={{ color: p.color }}>{p.name}</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--tm)' }}>{p.desc}</p>
              <div className="text-2xl font-bold mt-4 mb-6" style={{ color: 'var(--t)' }}>{p.price}</div>
              <ul className="space-y-2 mb-6">
                {p.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--ts)' }}>
                    <Check className="h-3.5 w-3.5 flex-shrink-0" style={{ color: p.color }} /> {f}
                  </li>
                ))}
              </ul>
              <Link to={`/register`}
                className="block text-center py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{
                  background: p.popular ? 'linear-gradient(135deg, #4f8cff 0%, #6366F1 40%, #8B5CF6 100%)' : isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
                  color: p.popular ? '#fff' : 'var(--ts)',
                  border: p.popular ? 'none' : '1px solid var(--border)',
                }}>
                Rozpocznij
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Asystent InfraDesk */}
      <section className="px-6 md:px-12 py-16 max-w-7xl mx-auto">
        <div className="rounded-3xl p-8 md:p-12 text-center"
          style={{ background: 'linear-gradient(145deg, rgba(16,185,129,0.08), rgba(59,130,246,0.06))', border: '1px solid rgba(16,185,129,0.15)' }}>
          <h2 className="text-2xl md:text-3xl font-bold mb-4">Asystent InfraDesk</h2>
          <p className="max-w-xl mx-auto mb-8" style={{ color: 'var(--ts)' }}>
            Darmowe narzędzie do monitorowania i optymalizacji komputera.
            Potrzebujesz pomocy? AI zdiagnozuje problem i naprawi go automatycznie.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto mb-8">
            <div className="rounded-xl p-4" style={{ background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)' }}>
              <div className="text-2xl font-bold text-emerald-400">9 zł</div>
              <div className="text-sm mt-1 font-medium" style={{ color: 'var(--ts)' }}>Diagnoza AI</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--tm)' }}>AI przeskanuje i zdiagnozuje problem</div>
            </div>
            <div className="rounded-xl p-4" style={{ background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)' }}>
              <div className="text-2xl font-bold text-blue-400">29 zł</div>
              <div className="text-sm mt-1 font-medium" style={{ color: 'var(--ts)' }}>Naprawa AI</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--tm)' }}>AI naprawi problem automatycznie</div>
            </div>
            <div className="rounded-xl p-4" style={{ background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)' }}>
              <div className="text-2xl font-bold text-violet-400">od 89 zł</div>
              <div className="text-sm mt-1 font-medium" style={{ color: 'var(--ts)' }}>Pomoc zdalna</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--tm)' }}>Technik połączy się z Twoim komputerem</div>
            </div>
          </div>
          <a href="/downloads/Asystent%20InfraDesk.exe"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(145deg, #059669, #0EA5E9)', boxShadow: '0 4px 20px rgba(5,150,105,0.3)' }}>
            <Download className="h-4 w-4" /> Pobierz Asystent InfraDesk — za darmo
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 md:px-12 py-12 max-w-7xl mx-auto" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src="/logo-mono.png" alt="" className="h-6 w-6" />
              <span className="font-bold">InfraDesk</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--tm)' }}>Platforma do zarządzania infrastrukturą IT dla firm i użytkowników domowych.</p>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--tm)' }}>Produkt</h4>
            <div className="space-y-2 text-sm" style={{ color: 'var(--tm)' }}>
              <Link to="/register" className="block hover:text-white/50">Załóż konto</Link>
              <a href="/downloads/InfraDesk.exe" className="block hover:text-white/50">Pobierz InfraDesk</a>
              <a href="/downloads/InfraDesk%20Server%20Agent.exe" className="block hover:text-white/50">Pobierz InfraDesk Server</a>
              <Link to="/login" className="block hover:text-white/50">Zaloguj się</Link>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--tm)' }}>Prawne</h4>
            <div className="space-y-2 text-sm" style={{ color: 'var(--tm)' }}>
              <Link to="/regulamin" className="block hover:text-white/50">Regulamin</Link>
              <Link to="/prywatnosc" className="block hover:text-white/50">Polityka prywatności</Link>
              <Link to="/rodo" className="block hover:text-white/50">RODO</Link>
              <Link to="/platnosci" className="block hover:text-white/50">Regulamin płatności</Link>
              <Link to="/kontakt" className="block hover:text-white/50">Kontakt</Link>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--tm)' }}>Kontakt</h4>
            <div className="space-y-2 text-sm" style={{ color: 'var(--tm)' }}>
              <p>SILERS — Błaszczykowski Adrian</p>
              <p>ul. Żeromskiego 29, 08-400 Garwolin</p>
              <p>NIP: 826-194-10-94</p>
              <p>kontakt@infradesk.pl</p>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-6 text-center text-xs" style={{ color: 'var(--td)', borderTop: '1px solid var(--border)' }}>
          © {new Date().getFullYear()} SILERS — Błaszczykowski Adrian. Wszelkie prawa zastrzeżone.
        </div>
      </footer>
    </div>
  );
}
