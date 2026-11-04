import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { Building2, Check, LogIn, Search, ShieldCheck, Smartphone, UserPlus, Users } from 'lucide-react-native';
import { Button, IconTile, ScalePressable, type Tone } from '@/components/ui';
import { AuthLink, BrandBand, BrandStatusStrip, useBrandTopRow } from '@/components/AuthLayout';
import { colors, font, radius, space, tokens, touch, type } from '@/constants/tokens';
import { durations, easings } from '@/constants/motion';
import type { RegisterRole } from '@/utils/registerRole';

const TERMS_URL = 'https://www.chemisttasker.com.au/terms-of-service';
const PRIVACY_URL = 'https://www.chemisttasker.com.au/privacy-policy';
const heroPhoto = require('../assets/images/landing/pharmacist-priya.jpg');
// The light sheet rides up over the band by this much (same as AuthLayout).
const SHEET_OVERLAP = 24;

// Web landing personas (landing_next persona-data.ts: each group's first entry; "New to pharmacy" = Pharmacy Student).
// Dot = the web accent in tokens; text, checks and the chosen border use the AA shade of the same hue.
const PERSONAS: {
    label: string;
    role: RegisterRole;
    dot: string;
    fg: string;
    bg: string;
    heading: string;
    benefits: string[];
}[] = [
    {
        label: 'Owner',
        role: 'OWNER',
        dot: colors.brandNavy,
        fg: colors.brandNavy,
        bg: colors.tone.blue.bg,
        heading: 'See the gap. Keep the pharmacy moving.',
        benefits: [
            'See open roster gaps alongside your team and pharmacy context.',
            'Offer work to your own people before widening the search.',
            'Keep attendance and invoices connected to the shift.',
        ],
    },
    {
        label: 'Pharmacist',
        role: 'PHARMACIST',
        dot: colors.primary,
        fg: colors.tone.violet.fg,
        bg: colors.tone.violet.bg,
        heading: 'Keep your next shift within reach.',
        benefits: [
            'Browse shifts by place and timing.',
            'Keep your availability and professional profile ready.',
            'Follow confirmed work through to its details and invoice.',
        ],
    },
    {
        label: 'Pharmacy team',
        role: 'OTHER_STAFF',
        dot: colors.secondary,
        fg: colors.tone.magenta.fg,
        bg: colors.tone.magenta.bg,
        heading: 'Know what your day looks like.',
        benefits: [
            'Check where and when you are rostered.',
            'Keep your availability current.',
            'Follow team conversations in Pharmacy Hub.',
        ],
    },
    {
        label: 'New to pharmacy',
        role: 'EXPLORER',
        dot: colors.tone.cyan.fg,
        fg: colors.tone.cyan.fg,
        bg: colors.tone.cyan.bg,
        heading: 'Find a starting point in pharmacy.',
        benefits: [
            'See what pharmacy opportunities are available.',
            'Explore learning and shared resources.',
            'Build a profile that can grow with you.',
        ],
    },
];

const VALUES: { icon: React.ReactElement; tone: Tone; title: string; line: string }[] = [
    { icon: <Building2 />, tone: 'violet', title: 'Pharmacy-first', line: 'Built around pharmacy work' },
    { icon: <Users />, tone: 'blue', title: 'One connected workforce', line: 'From your team to wider talent' },
    { icon: <Smartphone />, tone: 'magenta', title: 'Web & mobile', line: 'Wherever work takes you' },
    { icon: <ShieldCheck />, tone: 'cyan', title: 'Role-aware access', line: 'The right tools for each person' },
];

/** Signed-out landing: brand hero with the web headline and photo, persona chips, value grid, sticky sign-up / sign-in bar. */
export default function WelcomeScreen() {
    const router = useRouter();
    const { width, fontScale } = useWindowDimensions();
    const { bottom } = useSafeAreaInsets();
    const reduceMotion = useReducedMotion();
    const { topRowEnd, onBandLayout } = useBrandTopRow();
    const [role, setRole] = useState<RegisterRole | null>(null);
    const compact = width < 380;
    const oneColumn = compact || fontScale >= 1.3;
    const persona = PERSONAS.find((item) => item.role === role);

    return (
        <View style={styles.container}>
            <BrandStatusStrip topRowEnd={topRowEnd} />
            <SafeAreaView style={styles.flex} edges={['left', 'right']}>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    <BrandBand
                        topRowEnd={topRowEnd}
                        onLayout={onBandLayout}
                        style={[styles.band, compact ? styles.gutterCompact : null]}
                    >
                        <View style={styles.column}>
                            <Animated.View
                                entering={reduceMotion ? undefined : FadeIn.duration(durations.slow).easing(easings.smoothOut)}
                                style={styles.pitch}
                            >
                                <Text style={styles.eyebrow} maxFontSizeMultiplier={1.6}>
                                    ChemistTasker
                                </Text>
                                <Text accessibilityRole="header" style={styles.headline} maxFontSizeMultiplier={1.6}>
                                    {'Locum shifts.\nPharmacy teams.\n'}
                                    <Text style={styles.headlineAccent}>Better together.</Text>
                                </Text>
                                <Text style={styles.lede} maxFontSizeMultiplier={1.6}>
                                    Find pharmacy work, discover talent and keep your team connected.
                                </Text>
                            </Animated.View>

                            <Animated.View
                                entering={
                                    reduceMotion
                                        ? undefined
                                        : FadeInUp.duration(durations.slow).delay(durations.micro).easing(easings.smoothOut)
                                }
                                style={styles.photo}
                            >
                                <Image
                                    source={heroPhoto}
                                    style={StyleSheet.absoluteFill}
                                    contentFit="cover"
                                    contentPosition="top"
                                    accessible
                                    accessibilityLabel="Pharmacy professional in a bright community pharmacy"
                                />
                                <View style={styles.captionRow}>
                                    <View style={styles.caption}>
                                        <View style={styles.captionDot} />
                                        <Text style={styles.captionText} maxFontSizeMultiplier={1.3}>
                                            People at the heart of pharmacy.
                                        </Text>
                                    </View>
                                </View>
                            </Animated.View>
                        </View>
                    </BrandBand>

                    <View style={[styles.sheet, compact ? styles.gutterCompact : null]}>
                        <View style={[styles.column, styles.sheetColumn]}>
                            <View style={styles.section}>
                                <Text accessibilityRole="header" style={styles.sectionTitle}>
                                    I am a...
                                </Text>
                                <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="I am a">
                                    {PERSONAS.map((item) => {
                                        const selected = item.role === role;
                                        return (
                                            <ScalePressable
                                                key={item.role}
                                                pressBg
                                                haptic="selection"
                                                // Tapping the chosen chip again clears it, so Create account opens with no role.
                                                onPress={() => setRole(selected ? null : item.role)}
                                                accessibilityRole="radio"
                                                accessibilityState={{ checked: selected }}
                                                accessibilityLabel={item.label}
                                                style={[
                                                    styles.chip,
                                                    selected ? { borderColor: item.fg, backgroundColor: item.bg } : null,
                                                ]}
                                            >
                                                <View style={[styles.chipDot, { backgroundColor: item.dot }]} />
                                                <Text style={[styles.chipText, selected ? { color: item.fg } : null]}>
                                                    {item.label}
                                                </Text>
                                            </ScalePressable>
                                        );
                                    })}
                                </View>

                                {persona ? (
                                    <Animated.View
                                        key={persona.role}
                                        entering={reduceMotion ? undefined : FadeIn.duration(durations.quick)}
                                        accessibilityLiveRegion="polite"
                                        style={styles.personaCard}
                                    >
                                        <Text style={styles.personaHeading}>{persona.heading}</Text>
                                        {persona.benefits.map((benefit) => (
                                            <View key={benefit} style={styles.benefit}>
                                                <Check size={18} color={persona.fg} strokeWidth={2} style={styles.benefitIcon} />
                                                <Text style={styles.benefitText}>{benefit}</Text>
                                            </View>
                                        ))}
                                    </Animated.View>
                                ) : null}
                            </View>

                            <View style={styles.values}>
                                {VALUES.map((value) => (
                                    <View
                                        key={value.title}
                                        accessible
                                        style={[styles.value, oneColumn ? styles.valueRow : styles.valueCell]}
                                    >
                                        <IconTile icon={value.icon} tone={value.tone} size={36} />
                                        <View style={styles.valueText}>
                                            <Text style={styles.valueTitle} maxFontSizeMultiplier={1.4}>
                                                {value.title}
                                            </Text>
                                            <Text style={styles.valueLine} maxFontSizeMultiplier={1.4}>
                                                {value.line}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </View>

                            {/* Links are 44pt AuthLinks on their own row; inline Text links are too small to tap. */}
                            <Text style={styles.footerText}>By continuing, you agree to our</Text>
                            <View style={styles.legalLinks}>
                                <AuthLink label="Terms of Service" onPress={() => void Linking.openURL(TERMS_URL).catch(() => {})} />
                                <AuthLink label="Privacy Policy" onPress={() => void Linking.openURL(PRIVACY_URL).catch(() => {})} />
                            </View>
                        </View>
                    </View>
                </ScrollView>

                {/* Stacked full width so neither label wraps at the largest text size; terms live in the scroll. */}
                <View
                    style={[
                        styles.bar,
                        compact ? styles.gutterCompact : null,
                        { paddingBottom: bottom + space.md },
                    ]}
                >
                    <View style={[styles.column, styles.actions]}>
                        <Button
                            label="Create account"
                            icon={<UserPlus />}
                            haptic="medium"
                            onPress={() => router.push(role ? { pathname: '/register', params: { role } } : '/register')}
                        />
                        <Button variant="outlined" label="Sign in" icon={<LogIn />} onPress={() => router.push('/login')} />
                        <Button
                            variant="outlined"
                            label="Browse shifts"
                            icon={<Search />}
                            onPress={() => router.push('/shifts/public-board')}
                        />
                    </View>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.pageBg },
    flex: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    band: {
        paddingHorizontal: space.xl,
        paddingTop: space.md,
        paddingBottom: space['2xl'] + SHEET_OVERLAP,
    },
    gutterCompact: { paddingHorizontal: space.lg },
    column: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: space['2xl'] },
    pitch: { gap: space.md },
    eyebrow: {
        color: colors.surfaceBg,
        fontFamily: font.inter.semiBold,
        fontSize: 12,
        lineHeight: 16,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
    },
    headline: {
        color: colors.surfaceBg,
        fontFamily: type.displayLarge.fontFamily,
        fontSize: type.displayLarge.fontSize,
        lineHeight: type.displayLarge.lineHeight,
        letterSpacing: type.displayLarge.letterSpacing,
    },
    // Web hero accent: light magenta, >= 5.7:1 on every gradient stop.
    headlineAccent: { color: tokens.dark.secondary },
    lede: {
        color: colors.tone.violet.bg,
        fontFamily: font.inter.regular,
        fontSize: type.bodyLarge.fontSize,
        lineHeight: type.bodyLarge.lineHeight,
        maxWidth: 420,
    },
    photo: {
        width: '100%',
        aspectRatio: 16 / 11,
        overflow: 'hidden',
        borderRadius: radius.card,
        borderCurve: 'continuous',
        backgroundColor: colors.accentStrong,
    },
    // A row so the pill hugs its text instead of stretching between the insets.
    captionRow: { position: 'absolute', left: space.md, right: space.md, bottom: space.md, flexDirection: 'row' },
    caption: {
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.md,
        paddingVertical: space.xs + space.xxs,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceBg,
    },
    captionDot: {
        width: 8,
        height: 8,
        borderRadius: radius.pill,
        backgroundColor: colors.secondary,
    },
    captionText: {
        flexShrink: 1,
        color: colors.textPrimary,
        fontFamily: font.inter.semiBold,
        fontSize: type.labelMedium.fontSize,
        lineHeight: type.labelMedium.lineHeight,
    },
    sheet: {
        flexGrow: 1,
        marginTop: -SHEET_OVERLAP,
        paddingHorizontal: space.xl,
        paddingTop: space['2xl'],
        paddingBottom: space['2xl'],
        borderTopLeftRadius: radius.sheet,
        borderTopRightRadius: radius.sheet,
        borderCurve: 'continuous',
        backgroundColor: colors.pageBg,
    },
    sheetColumn: { gap: space['2xl'] },
    section: { gap: space.md },
    sectionTitle: {
        color: colors.textPrimary,
        fontFamily: type.titleMedium.fontFamily,
        fontSize: type.titleMedium.fontSize,
        lineHeight: type.titleMedium.lineHeight,
        letterSpacing: type.titleMedium.letterSpacing,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    chip: {
        minHeight: touch.min,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: colors.inputBorder,
        backgroundColor: colors.surfaceBg,
    },
    chipDot: { width: 8, height: 8, borderRadius: radius.pill },
    chipText: {
        flexShrink: 1,
        color: colors.textPrimary,
        fontFamily: font.inter.semiBold,
        fontSize: type.labelLarge.fontSize,
        lineHeight: type.labelLarge.lineHeight,
    },
    personaCard: {
        gap: space.md,
        padding: space.xl,
        borderRadius: radius.card,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceBg,
    },
    personaHeading: {
        color: colors.textPrimary,
        fontFamily: type.titleMedium.fontFamily,
        fontSize: type.titleMedium.fontSize,
        lineHeight: type.titleMedium.lineHeight,
        letterSpacing: type.titleMedium.letterSpacing,
    },
    benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
    benefitIcon: { marginTop: 2 },
    benefitText: {
        flex: 1,
        color: colors.textSecondary,
        fontFamily: font.inter.regular,
        fontSize: type.bodyMedium.fontSize,
        lineHeight: type.bodyMedium.lineHeight,
    },
    values: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: space.xl,
        columnGap: space.lg,
        padding: space.xl,
        borderRadius: radius.card,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceBg,
    },
    value: { gap: space.md },
    // Two per row: the gap is taken out of the basis before the cells grow into the line.
    valueCell: { flexBasis: '40%', flexGrow: 1 },
    valueRow: { width: '100%', flexDirection: 'row', alignItems: 'center' },
    valueText: { flexShrink: 1, gap: space.xxs },
    valueTitle: {
        color: colors.textPrimary,
        fontFamily: font.inter.semiBold,
        fontSize: type.labelLarge.fontSize,
        lineHeight: type.labelLarge.lineHeight,
    },
    valueLine: {
        color: colors.textSecondary,
        fontFamily: font.inter.regular,
        fontSize: type.bodySmall.fontSize,
        lineHeight: type.bodySmall.lineHeight,
    },
    footerText: {
        color: colors.textSecondary,
        fontFamily: font.inter.regular,
        fontSize: type.bodySmall.fontSize,
        lineHeight: type.bodySmall.lineHeight,
        textAlign: 'center',
        paddingHorizontal: space.sm,
    },
    legalLinks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, justifyContent: 'center', marginTop: -space.sm },
    bar: {
        paddingHorizontal: space.xl,
        paddingTop: space.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        backgroundColor: colors.surfaceBg,
    },
    actions: { gap: space.md },
});
