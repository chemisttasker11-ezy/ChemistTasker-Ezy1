import { FinanceAccess } from '@/components/FinanceAccess';
import React from 'react';
import InvoiceDetail from '@/roles/shared/invoices/InvoiceDetail';

export default function OtherStaffInvoiceDetailRoute() {
  return <FinanceAccess><InvoiceDetail basePath="/otherstaff/invoice" /></FinanceAccess>;
}
