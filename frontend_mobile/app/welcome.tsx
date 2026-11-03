import React from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { LogIn, UserPlus } from 'lucide-react-native';
import { Button } from '@/components/ui';
import { officialLogo } from '@/components/AuthLayout';
import { colors, font, space, type } from '@/constants/tokens';
import { durations, easings } from '@/constants/motion';

const TERMS_URL = 'https://www.chemisttasker.com.au/terms-of-service';
const PRIVACY_URL = 'https://www.chemisttasker.com.au/privacy-policy';
const LOGO_RATIO = 900 / 436;

export default function WelcomeScreen() {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const logoWidth = Math.min(260, width - space['3xl'] * 2);

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.column}>
                    {/* One light hero: the logo only reads on light surfaces, so the value prop sits with it here. */}
                    <Animated.View entering={FadeIn.duration(durations.slow).easing(easings.smoothOut)} style={styles.brand}>
                        <Image
                            source={officialLogo}
                            style={{ width: logoWidth, height: logoWidth / LOGO_RATIO }}
                            resizeMode="contain"
                            accessibilityRole="image"
                            accessibilityLabel="ChemistTasker, pharmacy workforce platform"
                        />
                        <View style={styles.pitch}>
                            <Text accessibilityRole="header" style={styles.title} maxFontSizeMultiplier={1.6}>
                                Connecting pharmacies with professionals
                            </Text>
                            <Text style={styles.subtitle}>Manage shifts, teams, and chats in one place.</Text>
                        </View>
                    </Animated.View>

                    <Animated.View
                        entering={FadeInUp.duration(durations.slow)
                            .delay(durations.micro)
                            .easing(easings.smoothOut)
                            .withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] })}
                        style={styles.bottom}
                    >
                        {/* Stacked full width so neither label wraps at the largest text size. */}
                        <View style={styles.actions}>
                            <Button label="Sign in" icon={<LogIn />} haptic="light" onPress={() => router.push('/login')} />
                            <Button
                                variant="outlined"
                                label="Create account"
                                icon={<UserPlus />}
                                onPress={() => router.push('/register')}
                            />
                        </View>
                        <Text style={styles.footerText}>
                            By continuing, you agree to our{' '}
                            <Text
                                style={styles.linkText}
                                accessibilityRole="link"
                                onPress={() => void Linking.openURL(TERMS_URL).catch(() => {})}
                            >
                                Terms of Service
                            </Text>{' '}
                            and{' '}
                            <Text
                                style={styles.linkText}
                                accessibilityRole="link"
                                onPress={() => void Linking.openURL(PRIVACY_URL).catch(() => {})}
                            >
                                Privacy Policy
                            </Text>
                            .
                        </Text>
                    </Animated.View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.pageBg,
    },
    content: {
        flexGrow: 1,
        paddingHorizontal: space.xl,
        paddingTop: space['2xl'],
        paddingBottom: space.lg,
    },
    column: {
        flex: 1,
        width: '100%',
        maxWidth: 520,
        alignSelf: 'center',
        justifyContent: 'space-between',
        gap: space['3xl'],
    },
    brand: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space['2xl'],
        minHeight: 160,
    },
    pitch: { gap: space.sm, maxWidth: 420 },
    title: {
        color: colors.textPrimary,
        fontFamily: type.displayMedium.fontFamily,
        fontSize: type.displayMedium.fontSize,
        lineHeight: type.displayMedium.lineHeight,
        letterSpacing: type.displayMedium.letterSpacing,
        textAlign: 'center',
    },
    subtitle: {
        color: colors.textSecondary,
        fontFamily: font.inter.regular,
        fontSize: type.bodyLarge.fontSize,
        lineHeight: type.bodyLarge.lineHeight,
        textAlign: 'center',
    },
    bottom: {
        gap: space.lg,
    },
    actions: {
        gap: space.md,
    },
    footerText: {
        color: colors.textSecondary,
        fontFamily: font.inter.regular,
        fontSize: type.bodySmall.fontSize,
        lineHeight: type.bodySmall.lineHeight,
        textAlign: 'center',
        paddingHorizontal: space.sm,
    },
    linkText: {
        color: colors.accentStrong,
        fontFamily: font.inter.medium,
        textDecorationLine: 'underline',
    },
});
