import { FinanceAccess } from '@/components/FinanceAccess';
import React from 'react';
import InvoiceDetail from '@/roles/shared/invoices/InvoiceDetail';

export default function PharmacistInvoiceDetailRoute() {
  return <FinanceAccess><InvoiceDetail basePath="/pharmacist/invoice" /></FinanceAccess>;
}
