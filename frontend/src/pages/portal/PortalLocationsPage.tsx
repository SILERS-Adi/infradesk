import { useQuery } from '@tanstack/react-query';
import { locationsApi } from '../../api/locations';
import { MapPin, Phone, Mail } from 'lucide-react';

const glass = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 18,
  ...extra,
});

export function PortalLocationsPage() {
  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations-portal'],
    queryFn: () => locationsApi.getAll(),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-7 w-7 border-2 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: 'rgba(255,255,255,0.2)' }}>LOCATIONS</p>
        <h1 className="text-[22px] font-semibold text-white/90">Moje lokalizacje</h1>
        <p className="text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{locations.length} lokalizacji</p>
      </div>

      {locations.length === 0 ? (
        <div className="rounded-[18px] p-12 text-center" style={glass()}>
          <MapPin className="h-10 w-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
          <p className="text-[14px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Brak lokalizacji</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {locations.map(loc => (
            <div key={loc.id} className="rounded-[18px] p-5 transition-all duration-200 hover:scale-[1.01]"
              style={{ ...glass(), boxShadow: '0 2px 16px rgba(0,0,0,0.12)' }}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(251,146,60,0.12)' }}>
                  <MapPin className="h-5 w-5" style={{ color: '#FB923C' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-[14px] font-semibold text-white/90">{loc.name}</div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(96,165,250,0.12)', color: '#60A5FA' }}>
                      {loc.type}
                    </span>
                  </div>
                  <div className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {[loc.addressLine1, loc.postalCode, loc.city].filter(Boolean).join(', ')}
                  </div>
                  {loc.contactPersonName && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="text-[12px] font-medium text-white/60">{loc.contactPersonName}</div>
                      <div className="flex gap-4 mt-1.5">
                        {loc.contactPersonPhone && (
                          <span className="flex items-center gap-1 text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            <Phone className="h-3 w-3" />{loc.contactPersonPhone}
                          </span>
                        )}
                        {loc.contactPersonEmail && (
                          <span className="flex items-center gap-1 text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            <Mail className="h-3 w-3" />{loc.contactPersonEmail}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
