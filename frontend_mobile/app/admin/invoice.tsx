import { FinanceAccess } from '@/components/FinanceAccess';
import InvoiceList from '@/roles/shared/invoices/InvoiceList';

export default function AdminInvoiceScreen() {
  return <FinanceAccess><InvoiceList basePath="/admin/invoice" /></FinanceAccess>;
}
