import { FinanceAccess } from '@/components/FinanceAccess';
import React from 'react';
import InvoiceGenerate from '@/roles/shared/invoices/InvoiceGenerate';

export default function PharmacistInvoiceNewRoute() {
  return <FinanceAccess><InvoiceGenerate basePath="/pharmacist/invoice" /></FinanceAccess>;
}
