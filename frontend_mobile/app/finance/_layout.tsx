import { Slot } from 'expo-router';
import { FinanceAccess } from '@/components/FinanceAccess';
export default function FinanceLayout() {
  return <FinanceAccess><Slot /></FinanceAccess>;
}
