import { Redirect } from 'expo-router';

// The owner first run lives at /setup/owner/onboarding (one multi-step flow, web's save rules);
// this older path forwards there so there is only one way to submit the owner profile.
export default function OnboardingLayout() {
  return <Redirect href="/setup/owner/onboarding" />;
}
