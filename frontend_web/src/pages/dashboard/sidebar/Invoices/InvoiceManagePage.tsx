import { CircularProgress, Container } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import FinanceWorkspace from '../../../finance/FinanceWorkspace';
import FinanceTheme from '../../../finance/FinanceTheme';
import { canIssueInvoices } from '../../../../utils/invoiceIssuer';

export default function InvoiceManagePage() {
  const auth = useAuth();
  const { pathname } = useLocation();
  if (!auth?.user) return <Container sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Container>;
  return (
    <FinanceTheme>
      <FinanceWorkspace
        // Owners, organisation staff and the pharmacy-admin workspace receive invoices; only
        // workers issue them. Same rule as the Expo InvoiceList (owner/organization/admin).
        receivedMode={!canIssueInvoices(auth.user.role) || pathname.startsWith('/dashboard/admin/')}
      />
    </FinanceTheme>
  );
}
