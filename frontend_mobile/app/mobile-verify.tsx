import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, type TextInputInstance, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Globe } from 'lucide-react-native';
import {
    mobileRequestOtp,
    mobileVerifyOtp,
    mobileResendOtp,
    skipMobileOverseas,
    canSkipOverseasMobileCheck,
} from '@chemisttasker/shared-core';
import { useAuth } from '../context/AuthContext';
import AuthLayout, { AuthLink, AuthNotice, OtpCodeInput } from '../components/AuthLayout';
import { Button, IconTile, TextField } from '@/components/ui';
import { colors, font, radius, space, type } from '@/constants/tokens';

type PendingAction = 'send' | 'verify' | 'resend' | 'skip';

export default function MobileVerifyScreen() {
    const router = useRouter();
    const { logout, markMobileVerified, markMobileCheckSkipped, user } = useAuth();
    const canSkipOverseas = canSkipOverseasMobileCheck(user);

    const [mobile, setMobile] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [username, setUsername] = useState('');
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [identityLocked, setIdentityLocked] = useState(false);
    // The code step appears once a code is on its way, so only one step leads at a time.
    const [codeSent, setCodeSent] = useState(false);
    const otpInputRef = useRef<TextInputInstance | null>(null);
    const lastNameRef = useRef<TextInputInstance | null>(null);
    const usernameRef = useRef<TextInputInstance | null>(null);
    const mobileRef = useRef<TextInputInstance | null>(null);
    // Which button shows the spinner; `loading` still locks every action as before.
    const [pending, setPending] = useState<PendingAction | null>(null);
    const run = (action: PendingAction, handler: () => Promise<void>) => {
        if (loading) return;
        setPending(action);
        void handler();
    };

    useEffect(() => {
        if (!user) return;
        setFirstName(user.first_name || '');
        setLastName(user.last_name || '');
        setUsername(user.username || '');
        setMobile(user.mobile_number || '');
    }, [user]);

    const getRoleHome = (role?: string | null): string => {
        const normalized = String(role || '').toUpperCase();
        switch (normalized) {
            case 'OWNER': return '/owner/dashboard';
            case 'PHARMACIST': return '/pharmacist/dashboard';
            case 'OTHER_STAFF': return '/otherstaff/dashboard';
            case 'EXPLORER': return '/explorer/dashboard';
            case 'ORGANIZATION': return '/organization/dashboard';
            default: return '/login';
        }
    };

    const requestCode = async () => {
        setError('');
        setStatus('');
        if (!firstName || !lastName || !username || !mobile) {
            setError('Please enter your first name, last name, username, and mobile number.');
            return;
        }
        setLoading(true);
        try {
            const sent: any = await mobileRequestOtp({
                first_name: firstName,
                last_name: lastName,
                username,
                mobile_number: mobile,
            });
            if (sent?.debug_otp) setOtp(sent.debug_otp);
            setCodeSent(true);
            setStatus(sent?.debug_otp ? `Test mode: no SMS sent. Your code is ${sent.debug_otp}.` : 'We sent a code to your mobile.');
        } catch (err: any) {
            setError(err?.message || 'Failed to send code.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        setError('');
        setStatus('');
        // The keyboard's Done key bypasses the button's disabled state.
        if (otp.length !== 6) {
            setError('Please enter the complete 6-digit code.');
            return;
        }
        setLoading(true);
        try {
            await mobileVerifyOtp({ otp });
            await markMobileVerified({
                first_name: firstName,
                last_name: lastName,
                username,
                mobile_number: mobile,
            });
            setIdentityLocked(true);
            setStatus('Mobile verified! Redirecting...');
            setTimeout(() => router.replace(getRoleHome(user?.role) as any), 800);
        } catch (err: any) {
            setError(err?.message || 'Verification failed.');
        } finally {
            setLoading(false);
        }
    };

    // Overseas newcomers without an Australian mobile: keep the legal name, skip the code, verify with photo ID instead.
    const handleSkipOverseas = async () => {
        setError('');
        setStatus('');
        if (!firstName || !lastName || !username) {
            setError('Please enter your first name, last name and username first.');
            return;
        }
        setLoading(true);
        try {
            await skipMobileOverseas({ first_name: firstName, last_name: lastName, username });
            await markMobileCheckSkipped({ first_name: firstName, last_name: lastName, username });
            setIdentityLocked(true);
            setStatus('Done. Next, upload photo ID to verify your profile.');
            setTimeout(() => router.replace('/explorer/profile-identity' as any), 800);
        } catch (err: any) {
            setError(err?.message || 'Could not skip the mobile check.');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setError('');
        setStatus('');
        setLoading(true);
        try {
            const resent: any = await mobileResendOtp({});
            if (resent?.debug_otp) setOtp(resent.debug_otp);
            setStatus(resent?.debug_otp ? `Test mode: no SMS sent. Your code is ${resent.debug_otp}.` : 'A new code has been sent to your mobile.');
        } catch (err: any) {
            setError(err?.message || 'Could not resend code.');
        } finally {
            setLoading(false);
        }
    };

    const handleOtpChange = (value: string) => {
        const digits = value.replace(/\D/g, '').slice(0, 6);
        setOtp(digits);
    };

    const handleBackToLogin = async () => {
        if (locked) return;
        setLoading(true);
        try {
            await logout();
            router.replace('/login' as any);
        } catch (err: any) {
            setError(err?.message || 'Could not log out.');
            setLoading(false);
        }
    };

    const locked = identityLocked || loading;
    const busy = (action: PendingAction) => loading && pending === action;
    const notices = (
        <>
            {error ? <AuthNotice tone="error" message={error} /> : null}
            {status ? <AuthNotice tone="success" message={status} /> : null}
        </>
    );

    return (
        <AuthLayout
            title="Verify your mobile"
            backDisabled={locked}
            subtitle="Your email is verified. Confirm your legal name, username and mobile number to open your workspace."
            footer={<AuthLink label="Back to login" onPress={() => void handleBackToLogin()} disabled={locked} />}
        >
            <Text style={styles.sectionTitle} accessibilityRole="header">Your details</Text>

            <TextField
                label="First legal name"
                value={firstName}
                onChangeText={setFirstName}
                textContentType="givenName"
                autoComplete="name-given"
                autoCapitalize="words"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => lastNameRef.current?.focus()}
                disabled={locked}
            />

            <TextField
                ref={lastNameRef}
                label="Last legal name"
                value={lastName}
                onChangeText={setLastName}
                textContentType="familyName"
                autoComplete="name-family"
                autoCapitalize="words"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => usernameRef.current?.focus()}
                disabled={locked}
            />

            <TextField
                ref={usernameRef}
                label="Username"
                value={username}
                onChangeText={setUsername}
                textContentType="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => mobileRef.current?.focus()}
                disabled={locked}
            />

            <TextField
                ref={mobileRef}
                label="Mobile number"
                value={mobile}
                onChangeText={setMobile}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                placeholder="e.g. 041x xxx xxx"
                returnKeyType="send"
                onSubmitEditing={() => run('send', requestCode)}
                disabled={locked}
            />

            <Button
                variant={codeSent ? 'outlined' : 'primary'}
                label="Send code"
                busyLabel="Sending code"
                onPress={() => run('send', requestCode)}
                busy={busy('send')}
                disabled={locked || !mobile}
                haptic={codeSent ? undefined : 'light'}
            />

            {codeSent ? null : notices}

            {codeSent ? (
                <>
                    <View style={styles.divider} />

                    <Text style={styles.sectionTitle} accessibilityRole="header">Verification code</Text>

                    <OtpCodeInput
                        inputRef={otpInputRef}
                        value={otp}
                        onChangeText={handleOtpChange}
                        invalid={Boolean(error) && otp.length < 6}
                        disabled={locked}
                        autoFocus
                        accessibilityHint={`The code we sent to ${mobile}`}
                        onSubmitEditing={() => run('verify', handleVerify)}
                    />

                    {notices}

                    <Button
                        label="Verify"
                        busyLabel="Verifying"
                        onPress={() => run('verify', handleVerify)}
                        busy={busy('verify')}
                        disabled={locked || otp.length !== 6}
                        haptic="light"
                    />

                    {/* No client cooldown (web parity): the server throttles resends and its refusal shows as the error. */}
                    <View style={styles.resendRow}>
                        <Text style={styles.resendText}>Didn&apos;t get it?</Text>
                        <AuthLink
                            label={busy('resend') ? 'Sending…' : 'Resend code'}
                            onPress={() => run('resend', handleResend)}
                            disabled={locked}
                        />
                    </View>
                </>
            ) : null}

            {canSkipOverseas ? (
                <View style={styles.overseas}>
                    <View style={styles.overseasHead}>
                        <IconTile icon={<Globe />} tone="blue" size={36} />
                        <Text style={styles.overseasTitle} accessibilityRole="header">Joining from overseas?</Text>
                    </View>
                    <Text style={styles.overseasBody}>
                        No Australian mobile yet? Fill in your legal name and username above, then skip this step. You will verify with photo ID instead, and your profile shows an Overseas label.
                    </Text>
                    <Button
                        variant="outlined"
                        label="Skip and verify with photo ID"
                        busyLabel="Skipping"
                        onPress={() => run('skip', handleSkipOverseas)}
                        busy={busy('skip')}
                        disabled={locked}
                    />
                </View>
            ) : null}
        </AuthLayout>
    );
}

const styles = StyleSheet.create({
    sectionTitle: {
        color: colors.textPrimary,
        fontFamily: font.outfit.medium,
        fontSize: type.titleSmall.fontSize,
        lineHeight: type.titleSmall.lineHeight,
        letterSpacing: type.titleSmall.letterSpacing,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: space.xs,
    },
    resendRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        columnGap: space.xs,
    },
    resendText: {
        color: colors.textSecondary,
        fontFamily: font.inter.regular,
        fontSize: type.bodyMedium.fontSize,
        lineHeight: type.bodyMedium.lineHeight,
    },
    overseas: {
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.nested,
        backgroundColor: colors.subtleBg,
        borderWidth: 1,
        borderColor: colors.border,
    },
    overseasHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
    },
    overseasTitle: {
        flex: 1,
        color: colors.textPrimary,
        fontFamily: font.inter.semiBold,
        fontSize: 15,
        lineHeight: 20,
    },
    overseasBody: {
        color: colors.textSecondary,
        fontFamily: font.inter.regular,
        fontSize: type.bodySmall.fontSize,
        lineHeight: type.bodySmall.lineHeight,
    },
});
