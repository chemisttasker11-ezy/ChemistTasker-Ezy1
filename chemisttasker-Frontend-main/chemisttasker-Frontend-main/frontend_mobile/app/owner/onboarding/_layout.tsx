import { Stack } from 'expo-router';
import OnboardingProvider from './_context';

export default function OnboardingLayout() {
    return (
        <OnboardingProvider>
            <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="step1" />
                <Stack.Screen name="step2" />
                <Stack.Screen name="step3" />
                <Stack.Screen name="review" />
            </Stack>
        </OnboardingProvider>
    );
}
