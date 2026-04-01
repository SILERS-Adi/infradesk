import { Link } from 'react-router-dom';
import { ChevronLeft, Phone, Mail, MapPin, Globe, Clock } from 'lucide-react';

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[#040a16] text-white">
      <nav className="flex items-center justify-between px-6 md:px-12 py-4 max-w-5xl mx-auto">
        <Link to="/" className="flex items-center gap-2 text-white/50 hover:text-white/80 text-sm">
          <ChevronLeft className="h-4 w-4" /> Strona główna
        </Link>
        <Link to="/login" className="text-sm text-white/40 hover:text-white/60">Zaloguj się</Link>
      </nav>

      <div className="max-w-4xl mx-auto px-6 md:px-12 py-12">
        {/* Phone hero */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Potrzebujesz pomocy?</h1>
          <p className="text-white/40 mb-8">Skontaktuj się z nami — jesteśmy do dyspozycji</p>
          <a href="tel:+48575662664" className="inline-flex items-center gap-3 px-8 py-5 rounded-2xl transition-all hover:scale-[1.02]"
            style={{ background: 'linear-gradient(145deg, rgba(139,92,246,0.15), rgba(37,99,235,0.1))', border: '2px solid rgba(139,92,246,0.25)' }}>
            <Phone className="h-7 w-7 text-violet-400" />
            <span className="text-3xl md:text-4xl font-bold tracking-wide">+48 575 662 664</span>
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Contact info */}
          <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="text-lg font-bold text-white/85 mb-4">Dane kontaktowe</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)' }}>
                  <Phone className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-xs text-white/35">Telefon</p>
                  <a href="tel:+48575662664" className="text-sm font-medium text-white/80 hover:text-violet-400">+48 575 662 664</a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
                  <Mail className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-white/35">Email</p>
                  <a href="mailto:kontakt@infradesk.pl" className="text-sm font-medium text-white/80 hover:text-blue-400">kontakt@infradesk.pl</a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                  <MapPin className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-white/35">Adres</p>
                  <p className="text-sm text-white/80">ul. Żeromskiego 29, 08-400 Garwolin</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251,191,36,0.1)' }}>
                  <Clock className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-white/35">Godziny pracy</p>
                  <p className="text-sm text-white/80">Pon–Pt: 8:00–17:00</p>
                  <p className="text-xs text-white/40">Pomoc zdalna: 24/7</p>
                </div>
              </div>
            </div>
          </div>

          {/* About */}
          <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="text-lg font-bold text-white/85 mb-4">O nas</h2>
            <p className="text-sm text-white/50 leading-relaxed mb-4">
              InfraDesk to platforma do zarządzania infrastrukturą IT stworzona przez <strong className="text-white/70">SILERS</strong> — firmę
              z wieloletnim doświadczeniem w obsłudze IT dla przedsiębiorstw.
            </p>
            <p className="text-sm text-white/50 leading-relaxed mb-4">
              Łączymy monitoring, zdalne zarządzanie, audyt bezpieczeństwa i sztuczną inteligencję
              w jednym narzędziu — dla firm IT, przedsiębiorstw i użytkowników domowych.
            </p>
            <p className="text-sm text-white/50 leading-relaxed mb-6">
              Naszą misją jest sprawić, aby profesjonalne zarządzanie IT było dostępne dla każdego —
              od dużych firm po użytkownika domowego potrzebującego pomocy.
            </p>
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <p className="text-xs text-white/30 mb-2">Operator platformy:</p>
              <p className="text-sm text-white/70 font-medium">SILERS — Błaszczykowski Adrian</p>
              <p className="text-xs text-white/35 mt-1">NIP: 826-194-10-94 · REGON: 142599930</p>
              <p className="text-xs text-white/35">ul. Żeromskiego 29, 08-400 Garwolin</p>
            </div>
          </div>
        </div>
      </div>

      <footer className="px-6 py-8 text-center text-xs text-white/20" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        © {new Date().getFullYear()} SILERS — Błaszczykowski Adrian. Wszelkie prawa zastrzeżone.
      </footer>
    </div>
  );
}
