import { FinanceAccess } from '@/components/FinanceAccess';
import InvoiceGenerate from '@/roles/shared/invoices/InvoiceGenerate';

export default function AdminInvoiceGenerateScreen() {
  return <FinanceAccess><InvoiceGenerate basePath="/admin/invoice" /></FinanceAccess>;
}
