import { FinanceAccess } from '@/components/FinanceAccess';
import InvoiceList from '@/roles/shared/invoices/InvoiceList';

export default function OwnerInvoiceScreen() {
  return <FinanceAccess><InvoiceList basePath="/owner/invoice" /></FinanceAccess>;
}
