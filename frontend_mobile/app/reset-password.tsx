import React, { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { passwordResetConfirm } from '@chemisttasker/shared-core';
import AuthLayout, { AuthLink, AuthNotice } from '../components/AuthLayout';
import { Button, TextField } from '@/components/ui';
import { space } from '@/constants/tokens';
import { useAuth } from '../context/AuthContext';

export default function ResetPasswordScreen() {
    const router = useRouter();
    const { logout } = useAuth();
    const params = useLocalSearchParams<{ uid?: string | string[]; token?: string | string[] }>();
    // A repeated query key arrives as an array; only a non-empty string is a usable link part.
    const uid = typeof params.uid === 'string' && params.uid ? params.uid : '';
    const token = typeof params.token === 'string' && params.token ? params.token : '';

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [logoutFailed, setLogoutFailed] = useState(false);
    const [loading, setLoading] = useState(false);
    const confirmRef = useRef<TextInputInstance>(null);

    const handleSubmit = async () => {
        if (loading) return;
        // The keyboard's Go key submits too, so the handler checks what the button alone cannot.
        if (!uid || !token) {
            setError('This reset link is incomplete. Request a new one from Forgot password.');
            return;
        }
        if (!newPassword || !confirmPassword) {
            setError('Please fill in all fields');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await passwordResetConfirm({
                uid,
                token,
                new_password1: newPassword,
                new_password2: confirmPassword,
            });
        } catch (resetErr: any) {
            setError(resetErr?.message || 'Failed to reset password. The link may be invalid or expired.');
            setLoading(false);
            return;
        }

        try {
            await logout();
            router.replace({ pathname: '/login', params: { reset: '1' } } as any);
        } catch {
            // Password change succeeded, but follow-up logout failed (e.g. HttpOnly web cookie session revocation failed).
            // Do NOT show as failed. Show honest password changed / check sign out state and login action.
            setLogoutFailed(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Set a new password"
            subtitle="Choose a new password for your account. You'll sign in with it next."
            onBack={router.canGoBack() ? () => router.back() : undefined}
            backDisabled={loading}
            footer={<AuthLink label="Back to login" onPress={() => router.replace('/login')} disabled={loading} />}
        >
            {error ? <AuthNotice tone="error" message={error} /> : null}

            {logoutFailed ? (
                <View style={{ gap: space.md }}>
                    <AuthNotice
                        tone="info"
                        message="Password updated successfully, but session sign-out could not be confirmed. Check your sign-out state before signing in."
                    />
                    <Button
                        label="Go to login"
                        onPress={() => router.replace({ pathname: '/login', params: { reset: '1' } } as any)}
                        haptic="light"
                    />
                </View>
            ) : (
                <>
                    <TextField
                        label="New password"
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secure
                        textContentType="newPassword"
                        autoComplete="new-password"
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="next"
                        submitBehavior="submit"
                        onSubmitEditing={() => confirmRef.current?.focus()}
                        disabled={loading}
                    />

                    <TextField
                        ref={confirmRef}
                        label="Confirm new password"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secure
                        textContentType="newPassword"
                        autoComplete="new-password"
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="go"
                        onSubmitEditing={() => void handleSubmit()}
                        disabled={loading}
                    />

                    <Button
                        label="Reset password"
                        busyLabel="Saving"
                        onPress={() => void handleSubmit()}
                        busy={loading}
                        haptic="light"
                    />
                </>
            )}
        </AuthLayout>
    );
}
