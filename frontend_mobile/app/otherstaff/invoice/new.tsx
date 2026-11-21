import { FinanceAccess } from '@/components/FinanceAccess';
import React from 'react';
import InvoiceGenerate from '@/roles/shared/invoices/InvoiceGenerate';

export default function OtherStaffInvoiceNewRoute() {
  return <FinanceAccess><InvoiceGenerate basePath="/otherstaff/invoice" /></FinanceAccess>;
}
