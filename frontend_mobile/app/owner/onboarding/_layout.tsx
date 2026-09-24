import React from 'react';
import { Redirect } from 'expo-router';

export default function LegacyOwnerOnboardingRedirect() {
  return <Redirect href="/setup/owner/onboarding" />;
}
