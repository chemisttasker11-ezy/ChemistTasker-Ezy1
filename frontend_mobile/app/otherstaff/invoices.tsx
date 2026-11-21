import { FinanceAccess } from '@/components/FinanceAccess';
import InvoiceList from '@/roles/shared/invoices/InvoiceList';

export default function OtherStaffInvoicesScreen() {
  return <FinanceAccess><InvoiceList basePath="/otherstaff/invoice" /></FinanceAccess>;
}
