import React from 'react';
import InvoiceList from '@/roles/shared/invoices/InvoiceList';

export default function PharmacistInvoiceRoute() {
  return <InvoiceList basePath="/pharmacist/invoice" />;
}
