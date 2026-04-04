import { PageHeader } from '../../components/ui/PageHeader';
import SharingContent from '../admin/SharingContent';

export default function OperatorSharing() {
  return (
    <div style={{ padding: '0 0 40px' }}>
      <PageHeader title="Udostępnianie" subtitle="Zarządzanie relacjami i uprawnieniami między firmami" />
      <SharingContent />
    </div>
  );
}
