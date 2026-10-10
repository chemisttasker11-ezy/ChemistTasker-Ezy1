import { useCallback, useEffect, useRef, useState } from 'react';
import { finance, type FinanceCustomer, type FinanceExpense, type FinanceInvoice, type FinanceItem } from '@chemisttasker/shared-core';
import { errorMessage } from './helpers';

/** One owner for list requests. Mode changes, retries and refreshes invalidate older replies. */
export function useFinanceData(receivedMode: boolean) {
  const generation = useRef(0);
  const [customers, setCustomers] = useState<FinanceCustomer[]>([]);
  const [items, setItems] = useState<FinanceItem[]>([]);
  const [invoices, setInvoices] = useState<FinanceInvoice[]>([]);
  const [receivedInvoices, setReceivedInvoices] = useState<FinanceInvoice[]>([]);
  const [expenses, setExpenses] = useState<FinanceExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState('');
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(async () => {
    const request = ++generation.current;
    if (receivedMode) {
      const next = await finance.receivedInvoices();
      if (request === generation.current) setReceivedInvoices(next);
    } else {
      const [nextCustomers, nextItems, nextInvoices, nextExpenses] = await Promise.all([
        finance.customers(), finance.items(), finance.invoices(), finance.expenses(),
      ]);
      if (request !== generation.current) return;
      setCustomers(nextCustomers); setItems(nextItems); setInvoices(nextInvoices); setExpenses(nextExpenses);
    }
  }, [receivedMode]);

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadFailed('');
    reload().catch(error => { if (active) setLoadFailed(errorMessage(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; generation.current += 1; };
  }, [reload, attempt]);

  return { customers, items, invoices, receivedInvoices, expenses, loading, loadFailed, reload, retry: () => setAttempt(n => n + 1) };
}
