import { CircularProgress, Container } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import FinanceWorkspace from '../../../finance/FinanceWorkspace';
import FinanceTheme from '../../../finance/FinanceTheme';
import { isIssuerWorkspace } from '../../../../utils/invoiceIssuer';

export default function InvoiceManagePage() {
  const auth = useAuth();
  const { pathname } = useLocation();
  if (!auth?.user) return <Container sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Container>;
  return (
    <FinanceTheme>
      <FinanceWorkspace
        // Persona, not base role: only a worker dashboard issues invoices. Owner, organisation and
        // pharmacy-admin dashboards receive them, as in the Expo InvoiceList (owner/organization/admin).
        receivedMode={!isIssuerWorkspace(pathname, auth.user.role)}
      />
    </FinanceTheme>
  );
}
