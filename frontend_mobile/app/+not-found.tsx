import { View } from 'react-native';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { Redirect } from 'expo-router';
import { hasOrganizationAccess } from '@chemisttasker/shared-core';
import { useAuth } from '../context/AuthContext';

function getHomeRoute(user: any) {
  const role = String(user?.role || '').toUpperCase();
  if (hasOrganizationAccess(user)) return '/organization/dashboard';
  if (role === 'OWNER') return '/owner/dashboard';
  if (role === 'PHARMACIST') return '/pharmacist/dashboard';
  if (role === 'OTHER_STAFF') return '/otherstaff/dashboard';
  if (role === 'EXPLORER') return '/explorer/dashboard';
  return '/login';
}

export default function NotFoundRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><BrandLoader size={44} accessibilityLabel="Restoring session" /></View>;
  }

  return <Redirect href={getHomeRoute(user) as any} />;
}
