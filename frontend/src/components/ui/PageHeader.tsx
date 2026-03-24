import { type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  back?: boolean | string;
}

export function PageHeader({ title, subtitle, actions, back }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-center gap-3">
        {back && (
          <button
            onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
