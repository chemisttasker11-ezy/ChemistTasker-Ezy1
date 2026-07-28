import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BackHandler, Pressable, StyleSheet, TextInput as RNTextInput, View } from 'react-native';
import { Text, Button, Surface } from 'react-native-paper';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';

export default function VerifyOTPScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ email?: string }>();
    const { verifyOTP, resendOTP, user } = useAuth();
    const email = typeof params.email === 'string' ? params.email : (user?.email || '');

    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [resending, setResending] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    const inputRef = useRef<RNTextInput | null>(null);

    // Android hardware back: go back in navigation stack when possible
    useFocusEffect(
        useCallback(() => {
            const onBackPress = () => {
                if (router.canGoBack()) {
                    router.back();
                    return true; // we handled it
                }
                return false; // allow default (exit) when no history
            };
            const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
            return () => sub.remove();
        }, [router])
    );

    // Cooldown timer for resend
    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendCooldown]);

    const handleOTPChange = (value: string) => {
        const digits = value.replace(/\D/g, '').slice(0, 6);
        setOtp(digits);
    };

    const handleVerify = async () => {
        const code = otp;

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

    const handleResend = async () => {
        setResending(true);
        setError('');

        try {
            await resendOTP(email);
            setResendCooldown(60); // 60 second cooldown
            setOtp('');
            inputRef.current?.focus();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setResending(false);
        }
    };

    return (
        <AuthLayout title="Verify Your Email" showTitle={false}>
            <View>
                <Surface style={styles.header} elevation={0}>
                    <Text variant="headlineMedium" style={styles.title}>
                        Verify Your Email
                    </Text>
                    <Text variant="bodyMedium" style={styles.subtitle}>
                        This is the email verification step. We ask for it after registration, or when you try to log in before your email has been verified. We&apos;ve sent a 6-digit code to {email}.
                    </Text>
                </Surface>

                {error ? (
                    <Surface style={styles.errorContainer} elevation={1}>
                        <Text style={styles.errorText}>{error}</Text>
                    </Surface>
                ) : null}

                <RNTextInput
                    ref={inputRef}
                    value={otp}
                    onChangeText={handleOTPChange}
                    keyboardType="number-pad"
                    maxLength={6}
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    style={styles.hiddenInput}
                />

                <Pressable style={styles.otpContainer} onPress={() => inputRef.current?.focus()}>
                    {Array.from({ length: 6 }, (_, index) => {
                        const digit = otp[index] ?? '';
                        const isActive = index === otp.length && otp.length < 6;
                        return (
                            <View key={index} style={[styles.otpBox, isActive ? styles.otpBoxActive : null]}>
                                <Text style={styles.otpDigit}>{digit}</Text>
                            </View>
                        );
                    })}
                </Pressable>

                <Button
                    mode="contained"
                    onPress={handleVerify}
                    loading={loading}
                    disabled={loading || otp.length !== 6}
                    style={styles.button}
                    contentStyle={styles.buttonContent}
                >
                    Verify
                </Button>

                <View style={styles.resendContainer}>
                    <Text variant="bodyMedium">Didn&apos;t receive the code?</Text>
                    {resendCooldown > 0 ? (
                        <Text variant="bodySmall" style={styles.cooldownText}>
                            Resend in {resendCooldown}s
                        </Text>
                    ) : (
                        <Button
                            mode="text"
                            onPress={handleResend}
                            loading={resending}
                            disabled={resending}
                            compact
                        >
                            Resend Code
                        </Button>
                    )}
                </View>
            </View>
        </AuthLayout>
    );
}

const styles = StyleSheet.create({
    header: {
        marginBottom: 32,
        backgroundColor: 'transparent',
    },
    title: {
        fontWeight: 'bold',
        marginBottom: 8,
    },
    subtitle: {
        color: '#666',
    },
    errorContainer: {
        backgroundColor: '#ffebee',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
    },
    errorText: {
        color: '#c62828',
    },
    otpContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 32,
        gap: 8,
    },
    hiddenInput: {
        position: 'absolute',
        opacity: 0,
        width: 1,
        height: 1,
    },
    otpBox: {
        flex: 1,
        minHeight: 56,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#d0d7de',
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    otpBoxActive: {
        borderColor: '#7c3aed',
    },
    otpDigit: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    button: {
        borderRadius: 8,
        marginBottom: 24,
    },
    buttonContent: {
        paddingVertical: 8,
    },
    resendContainer: {
        alignItems: 'center',
        gap: 4,
    },
    cooldownText: {
        color: '#999',
        marginTop: 4,
    },
});
