import { FinanceAccess } from '@/components/FinanceAccess';
import InvoiceList from '@/roles/shared/invoices/InvoiceList';

export default function OrganizationInvoiceScreen() {
  return <FinanceAccess><InvoiceList basePath="/organization/invoice" /></FinanceAccess>;
}
