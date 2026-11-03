import React, { useState, useRef } from 'react';
import { StyleSheet, Text, type TextInputInstance, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import AuthLayout, { AuthLink, AuthNotice, AuthPrompt, OtpCodeInput } from '../components/AuthLayout';
import { Button, TextField } from '@/components/ui';
import { colors, font, space, type } from '@/constants/tokens';

export default function VerifyOTPScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ email?: string }>();
    const { verifyOTP, resendOTP, user } = useAuth();
    const initialEmail = typeof params.email === 'string' ? params.email : (user?.email || '');
    // Web parity: opened without an email (cold deep link), the screen asks for it instead of sending ''.
    const [askEmail] = useState(!initialEmail);
    const [email, setEmail] = useState(initialEmail);

    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const [resending, setResending] = useState(false);
    // One request at a time: a resend during verify would invalidate the code being checked.
    const busy = loading || resending;

    const inputRef = useRef<TextInputInstance | null>(null);

    const handleOTPChange = (value: string) => {
        const digits = value.replace(/\D/g, '').slice(0, 6);
        setOtp(digits);
    };

    const handleVerify = async () => {
        if (busy) return;
        const code = otp;
        setStatus('');

        if (!email) {
            setError('Please enter your email');
            return;
        }
        if (code.length !== 6) {
            setError('Please enter the complete 6-digit code');
            return;
        }

        setError('');
        setLoading(true);

        try {
            await verifyOTP(code, email);

            // Mirror web flow: after email OTP → go to mobile verification step
            router.replace('/mobile-verify' as any);
        } catch (err: any) {
            setError(err.message);
            // Clear OTP on error
            setOtp('');
            inputRef.current?.focus();
        } finally {
            setLoading(false);
        }
    };

    // No client cooldown (web parity): the server throttles resends and its refusal shows as the error.
    const handleResend = async () => {
        if (busy) return;
        setError('');
        setStatus('');
        if (!email) {
            setError('Please enter your email');
            return;
        }
        setResending(true);

        try {
            await resendOTP(email);
            setStatus('A new code has been sent to your email.');
            setOtp('');
            inputRef.current?.focus();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setResending(false);
        }
    };

    return (
        <AuthLayout
            title="Verify your email"
            subtitle={
                <>
                    Enter the 6-digit code we sent to{' '}
                    <Text style={styles.email}>{askEmail ? 'your email' : email}</Text>.
                </>
            }
            onBack={router.canGoBack() ? () => router.back() : undefined}
            backDisabled={busy}
            footer={
                <AuthPrompt
                    text="Wrong account?"
                    action={<AuthLink label="Back to sign in" onPress={() => router.replace('/login')} disabled={busy} />}
                />
            }
        >
            {error ? <AuthNotice tone="error" message={error} /> : null}
            {status ? <AuthNotice tone="success" message={status} /> : null}

            {askEmail ? (
                <TextField
                    label="Email"
                    value={email}
                    onChangeText={(value) => setEmail(value.trim().toLowerCase())}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => inputRef.current?.focus()}
                    disabled={busy}
                />
            ) : null}

            <OtpCodeInput
                inputRef={inputRef}
                value={otp}
                onChangeText={handleOTPChange}
                invalid={Boolean(error) && !otp}
                disabled={busy}
                autoFocus={!askEmail}
                autoComplete="one-time-code"
                accessibilityHint={askEmail ? undefined : `Sent to ${email}`}
                onSubmitEditing={() => void handleVerify()}
            />

            <Button
                label="Verify"
                busyLabel="Verifying"
                onPress={() => void handleVerify()}
                busy={loading}
                disabled={resending || otp.length !== 6}
                haptic="light"
            />

            <View style={styles.resend}>
                <Text style={styles.resendText}>Didn&apos;t receive the code?</Text>
                <AuthLink
                    label={resending ? 'Sending…' : 'Resend code'}
                    onPress={() => void handleResend()}
                    disabled={busy}
                />
            </View>

            <Text style={styles.why}>
                We ask for this after you register, or when you sign in before your email is verified.
            </Text>
        </AuthLayout>
    );
}

const styles = StyleSheet.create({
    email: {
        color: colors.textPrimary,
        fontFamily: font.inter.semiBold,
    },
    resend: {
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
    why: {
        color: colors.textSecondary,
        fontFamily: font.inter.regular,
        fontSize: type.bodySmall.fontSize,
        lineHeight: type.bodySmall.lineHeight,
        textAlign: 'center',
    },
});
