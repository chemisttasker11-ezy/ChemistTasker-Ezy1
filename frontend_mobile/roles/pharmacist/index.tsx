import { View } from 'react-native';
import { BrandLoader } from '@/components/ui/BrandLoader';
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

  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><BrandLoader size={44} accessibilityLabel="Loading workspace" /></View>;
  return <Redirect href="/pharmacist/dashboard" />;
}
