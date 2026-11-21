import { FinanceAccess } from '@/components/FinanceAccess';
import InvoiceDetail from '@/roles/shared/invoices/InvoiceDetail';

export default function AdminInvoiceDetailScreen() {
  return <FinanceAccess><InvoiceDetail basePath="/admin/invoice" /></FinanceAccess>;
}
