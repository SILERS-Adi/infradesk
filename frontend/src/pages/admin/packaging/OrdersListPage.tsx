/**
 * IDS 1.0 — Orders redirect to unified Shipments list
 */
import { Navigate } from 'react-router-dom';

export function OrdersListPage() {
  return <Navigate to="/packaging/shipments" replace />;
}

export default OrdersListPage;
