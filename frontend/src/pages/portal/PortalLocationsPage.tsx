import { useQuery } from '@tanstack/react-query';
import { locationsApi } from '../../api/locations';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { MapPin, Phone, Mail } from 'lucide-react';

export function PortalLocationsPage() {
  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations-portal'],
    queryFn: () => locationsApi.getAll(),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="Moje lokalizacje" subtitle={`${locations.length} lokalizacji`} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {locations.length === 0 ? (
          <p className="text-sm text-gray-500">Brak lokalizacji</p>
        ) : locations.map(loc => (
          <Card key={loc.id}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <MapPin className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-gray-900">{loc.name}</div>
                  <Badge color="indigo">{loc.type}</Badge>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {[loc.addressLine1, loc.postalCode, loc.city].filter(Boolean).join(', ')}
                </div>
                {loc.contactPersonName && (
                  <div className="mt-2 space-y-1">
                    <div className="text-xs text-gray-600 font-medium">{loc.contactPersonName}</div>
                    <div className="flex gap-3 text-xs text-gray-500">
                      {loc.contactPersonPhone && (
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{loc.contactPersonPhone}</span>
                      )}
                      {loc.contactPersonEmail && (
                        <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{loc.contactPersonEmail}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
