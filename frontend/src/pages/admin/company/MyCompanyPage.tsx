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
        subtitle="Zarządzaj danymi i ustawieniami kontaktowymi Twojej firmy"
      />

      {/* Logo Section */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-brand-500" />
          Logo firmy
        </h2>
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden">
            {logoPreview ? (
              <img src={logoPreview} alt="Logo podgląd" className="w-full h-full object-contain" />
            ) : (
              <Building2 className="h-8 w-8 text-gray-300" />
            )}
          </div>
          <div>
            <label className="inline-flex items-center gap-2 cursor-pointer bg-white border border-gray-300 text-sm font-medium text-gray-700 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors">
              <Upload className="h-4 w-4" />
              Wgraj logo
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            </label>
            <p className="text-xs text-gray-400 mt-1.5">PNG, JPG, SVG · max 2MB</p>
          </div>
        </div>
      </div>

      {/* Contact Settings */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5 flex items-center gap-2">
          <Phone className="h-5 w-5 text-brand-500" />
          Dane kontaktowe (widoczne dla klientów)
        </h2>

        {isLoading ? (
          <p className="text-sm text-gray-500">Ładowanie...</p>
        ) : (
          <form onSubmit={handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-gray-400" />Infolinia</span>
                </label>
                <input
                  {...register('infolinia')}
                  type="tel"
                  placeholder="+48 000 000 000"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-gray-400" />E-mail zgłoszeń</span>
                </label>
                <input
                  {...register('email')}
                  type="email"
                  placeholder="zgloszenia@firma.pl"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 mt-2">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <User className="h-4 w-4 text-gray-400" />
                Opiekun klienta
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Imię i nazwisko opiekuna</label>
                  <input
                    {...register('opiekun')}
                    type="text"
                    placeholder="Jan Kowalski"
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefon opiekuna</label>
                  <input
                    {...register('opiekunTel')}
                    type="tel"
                    placeholder="+48 000 000 000"
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail opiekuna</label>
                  <input
                    {...register('opiekunEmail')}
                    type="email"
                    placeholder="opiekun@firma.pl"
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
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
