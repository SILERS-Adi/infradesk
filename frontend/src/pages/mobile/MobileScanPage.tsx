import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, X, QrCode, Upload, AlertTriangle } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import toast from 'react-hot-toast';

/* ── Platform detection ──────────────────────────────────────────────────── */
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const isIOSNotSafari = isIOS && !isSafari;

export function MobileScanPage() {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleQrResult = useCallback((qrValue: string) => {
    stopCamera();
    const match = qrValue.match(/qr\/([a-f0-9-]+)/i);
    const code = match ? match[1] : qrValue.trim();
    if (code) {
      navigate(`/qr/${code}`);
    } else {
      toast.error('Nie rozpoznano kodu QR');
    }
  }, [navigate]);

  const startCamera = async () => {
    setError('');
    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      setScanning(true);

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          handleQrResult(decodedText);
        },
        () => {} // ignore errors during scanning
      );
    } catch (err: any) {
      console.error('[QR Scanner]', err);
      setScanning(false);
      if (err?.name === 'NotAllowedError' || String(err).includes('Permission')) {
        setError('Brak zgody na kamerę. Sprawdź ustawienia przeglądarki.');
      } else if (err?.name === 'NotFoundError' || String(err).includes('device')) {
        setError('Nie znaleziono kamery na tym urządzeniu.');
      } else {
        setError('Nie udało się uruchomić kamery. Użyj uploadu zdjęcia lub wpisz kod ręcznie.');
      }
    }
  };

  const stopCamera = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      try { scannerRef.current.clear(); } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const scanner = new Html5Qrcode('qr-reader-file');
      const result = await scanner.scanFile(file, true);
      try { scanner.clear(); } catch {}
      handleQrResult(result);
    } catch {
      toast.error('Nie znaleziono kodu QR na zdjęciu');
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="px-5 py-4 space-y-5">
      <h1 className="text-[20px] font-semibold text-white/90">Skanuj QR</h1>

      {/* iOS not Safari warning */}
      {isIOSNotSafari && (
        <div className="p-4 rounded-[16px]" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)' }}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#FBBF24' }} />
            <div>
              <p className="text-[13px] font-semibold" style={{ color: '#FBBF24' }}>Otwórz w Safari</p>
              <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Aby skanować QR kamerą, otwórz InfraDesk w Safari i dodaj do ekranu głównego. Możesz też wgrać zdjęcie QR lub wpisać kod ręcznie.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Camera scanner */}
      {scanning ? (
        <div className="relative rounded-[20px] overflow-hidden aspect-[4/3]" style={{ background: '#000' }}>
          <div id="qr-reader" className="w-full h-full" />
          <button onClick={stopCamera}
            className="absolute top-3 right-3 p-2 rounded-full z-10 active:scale-95"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
            <X className="h-5 w-5 text-white" />
          </button>
        </div>
      ) : !isIOSNotSafari ? (
        <button onClick={startCamera}
          className="w-full flex flex-col items-center gap-4 py-14 rounded-[20px] active:scale-[0.98] transition-all duration-200"
          style={{
            background: 'rgba(255,255,255,0.025)',
            border: '2px dashed rgba(139,92,246,0.25)',
            backdropFilter: 'blur(12px)',
          }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(139,92,246,0.12)' }}>
            <Camera className="h-8 w-8" style={{ color: '#A78BFA' }} />
          </div>
          <div className="text-center">
            <p className="text-[15px] font-semibold text-white/85">Uruchom kamerę</p>
            <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Zeskanuj kod QR urządzenia</p>
          </div>
        </button>
      ) : null}

      {/* Error */}
      {error && (
        <div className="p-3.5 rounded-[14px]" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <p className="text-[12px]" style={{ color: '#F87171' }}>{error}</p>
        </div>
      )}

      {/* Upload photo */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Wgraj zdjęcie kodu QR
        </p>
        <label className="flex items-center gap-3 px-4 py-3.5 rounded-[14px] cursor-pointer active:scale-[0.98] transition-all"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(96,165,250,0.1)' }}>
            <Upload className="h-5 w-5" style={{ color: '#60A5FA' }} />
          </div>
          <div>
            <p className="text-[13px] font-medium text-white/70">Wybierz zdjęcie z galerii</p>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>JPG, PNG — zdjęcie kodu QR</p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleFileUpload} />
        </label>
      </div>

      {/* Manual input */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Lub wpisz kod ręcznie
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && manualCode.trim() && handleQrResult(manualCode.trim())}
            placeholder="Wklej kod QR..."
            className="flex-1 px-4 py-3 rounded-[14px] text-[13px] focus:outline-none transition-all placeholder:text-white/20"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}
          />
          <button onClick={() => manualCode.trim() && handleQrResult(manualCode.trim())} disabled={!manualCode.trim()}
            className="px-5 py-3 rounded-[14px] active:scale-95 transition-all duration-200 disabled:opacity-40"
            style={{ background: 'linear-gradient(145deg, #6D28D9, #2563EB)' }}>
            <QrCode className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>

      {/* Hidden container for file scanning */}
      <div id="qr-reader-file" style={{ display: 'none' }} />
    </div>
  );
}
