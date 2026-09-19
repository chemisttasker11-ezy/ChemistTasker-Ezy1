import { CircularProgress, Container } from '@mui/material';
import { useAuth } from '../../../../contexts/AuthContext';
import FinanceWorkspace from '../../../finance/FinanceWorkspace';
import LegacyInvoiceManagePage from './LegacyInvoiceManagePage';
import FinanceTheme from '../../../finance/FinanceTheme';

export default function InvoiceManagePage() {
  const auth = useAuth();
  if (!auth?.user) return <Container sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Container>;
  return (
    <FinanceTheme>
      <FinanceWorkspace
        receivedMode={auth.user.role === 'OWNER'}
        existingTools={<LegacyInvoiceManagePage />}
      />
    </FinanceTheme>
  );
}
