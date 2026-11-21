import React from 'react';
import { Redirect } from 'expo-router';

export default function PharmacistOnboardingRedirect() {
  return <Redirect href="/pharmacist/profile-basic-info" />;
}
