import React, { useRef, useState } from 'react';
import { type TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { passwordResetConfirm } from '@chemisttasker/shared-core';
import AuthLayout, { AuthLink, AuthNotice } from '../components/AuthLayout';
import { Button, TextField } from '@/components/ui';
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
    const [loading, setLoading] = useState(false);
    const confirmRef = useRef<TextInput>(null);

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
            await logout();
            router.replace({ pathname: '/login', params: { reset: '1' } } as any);
        } catch {
            setError('Failed to reset password. The link may be invalid or expired.');
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
        </AuthLayout>
    );
}
