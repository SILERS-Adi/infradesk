import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Building2, Phone, Mail, User, Save, Upload } from 'lucide-react';
import apiClient from '../../../api/client';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';

interface ContactSettings {
  infolinia: string;
  email: string;
  opiekun: string;
  opiekunTel: string;
  opiekunEmail: string;
}

function useContactSettings() {
  return useQuery<ContactSettings>({
    queryKey: ['settings', 'contact'],
    queryFn: async () => {
      const { data } = await apiClient.get('/settings/contact');
      try {
        return typeof data.value === 'string' ? JSON.parse(data.value) : data;
      } catch {
        return data;
      }
    },
  });
}

export function MyCompanyPage() {
  const qc = useQueryClient();
  const { data: contact, isLoading } = useContactSettings();
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const { register, handleSubmit, reset } = useForm<ContactSettings>({
    values: contact,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: ContactSettings) => {
      await apiClient.put('/settings/contact', { value: JSON.stringify(values) });
    },
    onSuccess: () => {
      toast.success('Ustawienia kontaktowe zapisane');
      qc.invalidateQueries({ queryKey: ['settings', 'contact'] });
    },
    onError: () => toast.error('Błąd zapisu ustawień'),
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Dane firmy"
        helpKey="myCompany"
        subtitle="Zarządzaj danymi i ustawieniami kontaktowymi Twojej firmy"
      />

      {/* Logo Section */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h2 className="text-base font-semibold text-white/85 mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-violet-400" />
          Logo firmy
        </h2>
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden" style={{ border: '2px dashed var(--border)', background: 'var(--bg-card)' }}>
            {logoPreview ? (
              <img src={logoPreview} alt="Logo podgląd" className="w-full h-full object-contain" />
            ) : (
              <Building2 className="h-8 w-8" style={{ color: 'var(--td)' }} />
            )}
          </div>
          <div>
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium px-4 py-2 rounded-xl transition-colors hover:bg-white/[0.03]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--ts)' }}>
              <Upload className="h-4 w-4" />
              Wgraj logo
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            </label>
            <p className="text-xs mt-1.5" style={{ color: 'var(--tm)' }}>PNG, JPG, SVG · max 2MB</p>
          </div>
        </div>
      </div>

      {/* Contact Settings */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h2 className="text-base font-semibold text-white/85 mb-5 flex items-center gap-2">
          <Phone className="h-5 w-5 text-violet-400" />
          Dane kontaktowe (widoczne dla klientów)
        </h2>

        {isLoading ? (
          <p className="text-sm" style={{ color: 'var(--tm)' }}>Ładowanie...</p>
        ) : (
          <form onSubmit={handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ts)' }}>
                  <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" style={{ color: 'var(--tm)' }} />Infolinia</span>
                </label>
                <input
                  {...register('infolinia')}
                  type="tel"
                  placeholder="+48 000 000 000"
                  className="w-full px-3 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                  style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ts)' }}>
                  <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" style={{ color: 'var(--tm)' }} />E-mail zgłoszeń</span>
                </label>
                <input
                  {...register('email')}
                  type="email"
                  placeholder="zgloszenia@firma.pl"
                  className="w-full px-3 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                  style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
                />
              </div>
            </div>

            <div className="pt-4 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--ts)' }}>
                <User className="h-4 w-4" style={{ color: 'var(--tm)' }} />
                Opiekun klienta
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ts)' }}>Imię i nazwisko opiekuna</label>
                  <input
                    {...register('opiekun')}
                    type="text"
                    placeholder="Jan Kowalski"
                    className="w-full px-3 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                    style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ts)' }}>Telefon opiekuna</label>
                  <input
                    {...register('opiekunTel')}
                    type="tel"
                    placeholder="+48 000 000 000"
                    className="w-full px-3 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                    style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ts)' }}>E-mail opiekuna</label>
                  <input
                    {...register('opiekunEmail')}
                    type="email"
                    placeholder="opiekun@firma.pl"
                    className="w-full px-3 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                    style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', color: 'var(--t)' }}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                loading={saveMutation.isPending}
                icon={<Save className="h-4 w-4" />}
              >
                Zapisz ustawienia
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
