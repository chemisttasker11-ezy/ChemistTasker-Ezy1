import { View, StyleSheet } from 'react-native';
import { Text, TextInput, HelperText, Button, IconButton, Card } from 'react-native-paper';
import React from 'react';

type StepProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

export function StepSection({ title, description, children }: StepProps) {
  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.header}>
          <IconButton icon="check-circle-outline" size={20} />
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={styles.title}>{title}</Text>
            {description ? <Text variant="bodySmall" style={styles.subtitle}>{description}</Text> : null}
          </View>
        </View>
        <View style={{ gap: 8 }}>{children}</View>
      </Card.Content>
    </Card>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  helperText?: string;
  required?: boolean;
};

export function StepField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  helperText,
  required,
}: FieldProps) {
  return (
    <View>
      <TextInput
        label={required ? `${label} *` : label}
        value={value}
        onChangeText={onChangeText}
        mode="outlined"
        style={styles.input}
        placeholder={placeholder}
        keyboardType={keyboardType}
      />
      {helperText ? <HelperText type="info">{helperText}</HelperText> : null}
    </View>
  );
}

type ActionsProps = {
  onPrev?: () => void;
  onNext?: () => void;
  loading?: boolean;
  nextLabel?: string;
  disabled?: boolean;
};

export function StepActions({ onPrev, onNext, loading, nextLabel = 'Next', disabled }: ActionsProps) {
  return (
    <View style={styles.actions}>
      {onPrev ? (
        <Button mode="outlined" onPress={onPrev} style={{ flex: 1 }}>
          Back
        </Button>
      ) : null}
      {onNext ? (
        <Button mode="contained" onPress={onNext} loading={loading} disabled={disabled} style={{ flex: 1 }}>
          {nextLabel}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    color: '#6B7280',
  },
  input: {
    backgroundColor: '#FFFFFF',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
});
