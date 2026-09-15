import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput as RNTextInput, View } from 'react-native';
import { Text, TextInput, Button, Surface } from 'react-native-paper';
import { useRouter } from 'expo-router';
import {
    mobileRequestOtp,
    mobileVerifyOtp,
    mobileResendOtp,
} from '@chemisttasker/shared-core';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';

export default function MobileVerifyScreen() {
    const router = useRouter();
    const { logout, markMobileVerified, user } = useAuth();

    const [mobile, setMobile] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [username, setUsername] = useState('');
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [identityLocked, setIdentityLocked] = useState(false);
    const otpInputRef = useRef<RNTextInput | null>(null);

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
            await mobileRequestOtp({
                first_name: firstName,
                last_name: lastName,
                username,
                mobile_number: mobile,
            });
            setStatus('We sent a code to your mobile.');
        } catch (err: any) {
            setError(err?.message || 'Failed to send code.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        setError('');
        setStatus('');
        if (!otp) {
            setError('Please enter the OTP code.');
            return;
        }
        setLoading(true);
        try {
            await mobileVerifyOtp({ otp });
            setIdentityLocked(true);
            await markMobileVerified({
                first_name: firstName,
                last_name: lastName,
                username,
                mobile_number: mobile,
            });
            setStatus('Mobile verified! Redirecting...');
            setTimeout(() => router.replace(getRoleHome(user?.role) as any), 800);
        } catch (err: any) {
            setError(err?.message || 'Verification failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setError('');
        setStatus('');
        setLoading(true);
        try {
            await mobileResendOtp({});
            setStatus('A new code has been sent to your mobile.');
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
        await logout();
        router.replace('/login' as any);
    };

    return (
        <AuthLayout title="Mobile Verification">
            <Surface style={styles.infoContainer} elevation={0}>
                <Text variant="titleMedium" style={styles.infoTitle}>
                    Why mobile verification is required
                </Text>
                <Text variant="bodyMedium" style={styles.infoText}>
                    Your email is verified, but this account still needs a verified mobile number. We use this step after login to confirm your legal name, username, and mobile number before opening your workspace.
                </Text>
            </Surface>

            {error ? (
                <Surface style={styles.errorContainer} elevation={1}>
                    <Text style={styles.errorText}>{error}</Text>
                </Surface>
            ) : null}

            {status ? (
                <Surface style={styles.successContainer} elevation={1}>
                    <Text style={styles.successText}>{status}</Text>
                </Surface>
            ) : null}

            <TextInput
                label="First Legal Name"
                value={firstName}
                onChangeText={setFirstName}
                mode="outlined"
                style={styles.input}
                disabled={identityLocked || loading}
            />

            <TextInput
                label="Last Legal Name"
                value={lastName}
                onChangeText={setLastName}
                mode="outlined"
                style={styles.input}
                disabled={identityLocked || loading}
            />

            <TextInput
                label="Username"
                value={username}
                onChangeText={setUsername}
                mode="outlined"
                style={styles.input}
                disabled={identityLocked || loading}
            />

            <TextInput
                label="Mobile Number"
                value={mobile}
                onChangeText={setMobile}
                mode="outlined"
                style={styles.input}
                keyboardType="phone-pad"
                placeholder="e.g. 041x xxx xxx"
                disabled={identityLocked || loading}
            />

            <Button
                mode="outlined"
                onPress={requestCode}
                loading={loading}
                disabled={loading || !mobile}
                style={styles.outlinedButton}
                contentStyle={styles.buttonContent}
            >
                Send Code
            </Button>

            <RNTextInput
                ref={otpInputRef}
                value={otp}
                onChangeText={handleOtpChange}
                keyboardType="number-pad"
                maxLength={6}
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                style={styles.hiddenInput}
            />

            <Pressable style={styles.otpContainer} onPress={() => otpInputRef.current?.focus()}>
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

            <View style={styles.resendRow}>
                <Button
                    mode="text"
                    onPress={handleResend}
                    disabled={loading}
                    compact
                >
                    Resend Code
                </Button>
            </View>

            <View style={styles.backRow}>
                <Button mode="text" onPress={handleBackToLogin} style={styles.backButton}>
                    Back to login
                </Button>
            </View>
        </AuthLayout>
    );
}

const styles = StyleSheet.create({
    input: {
        backgroundColor: '#fff',
    },
    infoContainer: {
        backgroundColor: '#EEF8F7',
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
    },
    infoTitle: {
        color: '#0F766E',
        fontWeight: '700',
        marginBottom: 4,
    },
    infoText: {
        color: '#334155',
    },
    hiddenInput: {
        position: 'absolute',
        opacity: 0,
        width: 1,
        height: 1,
    },
    otpContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginVertical: 16,
        gap: 8,
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
        marginTop: 4,
        borderRadius: 8,
    },
    outlinedButton: {
        borderRadius: 8,
        borderColor: '#00a99d',
    },
    buttonContent: {
        paddingVertical: 8,
    },
    resendRow: {
        alignItems: 'center',
        marginTop: 4,
    },
    backRow: {
        alignItems: 'center',
    },
    backButton: {
        marginTop: 4,
    },
    errorContainer: {
        backgroundColor: '#ffebee',
        padding: 12,
        borderRadius: 8,
    },
    errorText: {
        color: '#c62828',
    },
    successContainer: {
        backgroundColor: '#ecfdf3',
        padding: 12,
        borderRadius: 8,
    },
    successText: {
        color: '#166534',
    },
});
