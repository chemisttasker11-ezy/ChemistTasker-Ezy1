import { useEffect } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

// Redirect /pharmacist -> /pharmacist/dashboard
export default function PharmacistIndex() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'PHARMACIST') {
      router.replace('/');
      return;
    }
  }, [user, isLoading, router]);

  if (isLoading) return null;
  return <Redirect href="/pharmacist/dashboard" />;
}
