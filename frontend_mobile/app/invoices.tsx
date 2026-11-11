import React, { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { resolveInitialWorkspace } from '@/utils/mobilePersona';

export default function InvoicesPage() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user, isLoading } = useAuth();
  useEffect(() => {
    if (isLoading || !user) return;
    let current = true;
    void resolveInitialWorkspace(user).then(home => {
      const persona = home.split('/')[1];
      if (current && ['owner', 'admin', 'organization', 'pharmacist', 'otherstaff'].includes(persona)) {
        router.replace({ pathname: `/${persona}/invoice`, params } as any);
      }
    });
    return () => { current = false; };
  }, [isLoading, user, router, params]);
  return null;
}
