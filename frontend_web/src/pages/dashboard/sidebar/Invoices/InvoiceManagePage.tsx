import { CircularProgress, Container } from '@mui/material';
import { useAuth } from '../../../../contexts/AuthContext';
import FinanceWorkspace from '../../../finance/FinanceWorkspace';
import LegacyInvoiceManagePage from './LegacyInvoiceManagePage';
import FinanceTheme from '../../../finance/FinanceTheme';

export default function InvoiceManagePage() {
  const auth = useAuth();
  if (!auth?.user) return <Container sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Container>;
  // Preserve the owner's received-invoice workflow without a behavioural rewrite.
  if (auth.user.role === 'OWNER') return <LegacyInvoiceManagePage />;
  return <FinanceTheme><FinanceWorkspace existingTools={<LegacyInvoiceManagePage />} /></FinanceTheme>;
}
