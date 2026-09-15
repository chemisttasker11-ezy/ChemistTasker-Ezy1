import React from 'react';
import InvoiceGenerate from '@/roles/shared/invoices/InvoiceGenerate';

export default function PharmacistInvoiceNewRoute() {
  return <InvoiceGenerate basePath="/pharmacist/invoice" />;
}
