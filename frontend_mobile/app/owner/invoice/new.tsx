import { FinanceAccess } from '@/components/FinanceAccess';
import InvoiceGenerate from '@/roles/shared/invoices/InvoiceGenerate';

export default function OwnerInvoiceGenerateScreen() {
  return <FinanceAccess><InvoiceGenerate basePath="/owner/invoice" /></FinanceAccess>;
}
