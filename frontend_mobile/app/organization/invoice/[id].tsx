import { FinanceAccess } from '@/components/FinanceAccess';
import InvoiceDetail from '@/roles/shared/invoices/InvoiceDetail';

export default function OrganizationInvoiceDetailScreen() {
  return <FinanceAccess><InvoiceDetail basePath="/organization/invoice" /></FinanceAccess>;
}
