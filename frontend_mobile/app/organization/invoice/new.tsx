import { FinanceAccess } from '@/components/FinanceAccess';
import InvoiceGenerate from '@/roles/shared/invoices/InvoiceGenerate';

export default function OrganizationInvoiceGenerateScreen() {
  return <FinanceAccess><InvoiceGenerate basePath="/organization/invoice" /></FinanceAccess>;
}
