import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import type { ReactNode } from 'react';

export function FinanceAccess({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return null;
  if (String(user.role).toUpperCase() === 'EXPLORER') return <Redirect href="/explorer/dashboard" />;
  return children;
}
