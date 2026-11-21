import { FinanceAccess } from '@/components/FinanceAccess';
import InvoiceDetail from '@/roles/shared/invoices/InvoiceDetail';

export default function OwnerInvoiceDetailScreen() {
  return <FinanceAccess><InvoiceDetail basePath="/owner/invoice" /></FinanceAccess>;
}
