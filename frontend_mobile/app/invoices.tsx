import React from 'react';
import { RootPageHeader } from '@/components/RootPageHeader';
import InvoiceList from '../roles/shared/invoices/InvoiceList';

export default function InvoicesPage() {
  return (
    <>
      <RootPageHeader title="Invoices" />
      <InvoiceList />
    </>
  );
}
