import { FinanceAccess } from '@/components/FinanceAccess';
import React from 'react';
import InvoiceList from '@/roles/shared/invoices/InvoiceList';

export default function PharmacistInvoiceRoute() {
  return <FinanceAccess><InvoiceList basePath="/pharmacist/invoice" /></FinanceAccess>;
}
