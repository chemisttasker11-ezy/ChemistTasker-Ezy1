import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';

const ORG_ROLES = new Set(['ORGANIZATION', 'ORG_ADMIN', 'ORG_OWNER', 'ORG_STAFF', 'CHIEF_ADMIN', 'REGION_ADMIN']);

function getHomeRoute(user: any) {
  const role = String(user?.role || '').toUpperCase();
  if (ORG_ROLES.has(role)) return '/organization/dashboard';
  if (role === 'OWNER') return '/owner/dashboard';
  if (role === 'PHARMACIST') return '/pharmacist/dashboard';
  if (role === 'OTHER_STAFF') return '/otherstaff/dashboard';
  if (role === 'EXPLORER') return '/explorer/dashboard';
  return '/login';
}

export default function NotFoundRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return <Redirect href={getHomeRoute(user) as any} />;
}
