import { Link } from 'react-router-dom';
import { ChevronLeft, Phone, Mail, MapPin, Globe, Clock } from 'lucide-react';
import { useTheme } from '../../store/themeStore';

export default function ContactPage() {
  const { resolved } = useTheme();
  const isLight = resolved === 'light';
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--t)' }}>
      <nav className="flex items-center justify-between px-6 md:px-12 py-4 max-w-5xl mx-auto">
        <Link to="/" className="flex items-center gap-2 text-sm" style={{ color: 'var(--ts)' }}>
          <ChevronLeft className="h-4 w-4" /> Strona główna
        </Link>
        <Link to="/login" className="text-sm" style={{ color: 'var(--tm)' }}>Zaloguj się</Link>
      </nav>

      <div className="max-w-4xl mx-auto px-6 md:px-12 py-12">
        {/* Phone hero */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Potrzebujesz pomocy?</h1>
          <p className="mb-8" style={{ color: 'var(--tm)' }}>Skontaktuj się z nami — jesteśmy do dyspozycji</p>
          <a href="tel:+48575662664" className="inline-flex items-center gap-3 px-8 py-5 rounded-2xl transition-all hover:scale-[1.02]"
            style={{ background: 'linear-gradient(145deg, rgba(139,92,246,0.15), rgba(37,99,235,0.1))', border: '2px solid rgba(139,92,246,0.25)' }}>
            <Phone className="h-7 w-7 text-violet-400" />
            <span className="text-3xl md:text-4xl font-bold tracking-wide">+48 575 662 664</span>
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Contact info */}
          <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--t)' }}>Dane kontaktowe</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)' }}>
                  <Phone className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--tm)' }}>Telefon</p>
                  <a href="tel:+48575662664" className="text-sm font-medium hover:text-violet-400" style={{ color: 'var(--t)', opacity: 0.8 }}>+48 575 662 664</a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
                  <Mail className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--tm)' }}>Email</p>
                  <a href="mailto:kontakt@infradesk.pl" className="text-sm font-medium hover:text-blue-400" style={{ color: 'var(--t)', opacity: 0.8 }}>kontakt@infradesk.pl</a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                  <MapPin className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--tm)' }}>Adres</p>
                  <p className="text-sm" style={{ color: 'var(--t)', opacity: 0.8 }}>ul. Żeromskiego 29, 08-400 Garwolin</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251,191,36,0.1)' }}>
                  <Clock className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--tm)' }}>Godziny pracy</p>
                  <p className="text-sm" style={{ color: 'var(--t)', opacity: 0.8 }}>Pon-Pt: 8:00-17:00</p>
                  <p className="text-xs" style={{ color: 'var(--tm)' }}>Pomoc zdalna: 24/7</p>
                </div>
              </div>
            </div>
          </div>

          {/* About */}
          <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--t)' }}>O nas</h2>
            <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--ts)' }}>
              InfraDesk to platforma do zarządzania infrastrukturą IT stworzona przez <strong style={{ color: 'var(--t)', opacity: 0.7 }}>SILERS</strong> — firmę
              z wieloletnim doświadczeniem w obsłudze IT dla przedsiębiorstw.
            </p>
            <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--ts)' }}>
              Łączymy monitoring, zdalne zarządzanie, audyt bezpieczeństwa i sztuczną inteligencję
              w jednym narzędziu — dla firm IT, przedsiębiorstw i użytkowników domowych.
            </p>
            <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--ts)' }}>
              Naszą misją jest sprawić, aby profesjonalne zarządzanie IT było dostępne dla każdego —
              od dużych firm po użytkownika domowego potrzebującego pomocy.
            </p>
            <div className="rounded-xl p-4" style={{ background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
              <p className="text-xs mb-2" style={{ color: 'var(--tm)' }}>Operator platformy:</p>
              <p className="text-sm font-medium" style={{ color: 'var(--t)', opacity: 0.7 }}>SILERS — Błaszczykowski Adrian</p>
              <p className="text-xs mt-1" style={{ color: 'var(--tm)' }}>NIP: 826-194-10-94 · REGON: 142599930</p>
              <p className="text-xs" style={{ color: 'var(--tm)' }}>ul. Żeromskiego 29, 08-400 Garwolin</p>
            </div>
          </div>
        </div>
      </div>

      <footer className="px-6 py-8 text-center text-xs" style={{ color: 'var(--td)', borderTop: '1px solid var(--border)' }}>
        © {new Date().getFullYear()} SILERS — Błaszczykowski Adrian. Wszelkie prawa zastrzeżone.
      </footer>
    </div>
  );
}
