import { FinanceAccess } from '@/components/FinanceAccess';
import React from 'react';
import InvoiceList from '@/roles/shared/invoices/InvoiceList';

export default function OtherStaffInvoiceRoute() {
  return <FinanceAccess><InvoiceList basePath="/otherstaff/invoice" /></FinanceAccess>;
}
