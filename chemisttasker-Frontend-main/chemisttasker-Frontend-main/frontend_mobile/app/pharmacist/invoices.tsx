import React from 'react';
import InvoiceList from '@/roles/shared/invoices/InvoiceList';

export default function PharmacistInvoicesScreen() {
  return <InvoiceList basePath="/pharmacist/invoice" />;
}
