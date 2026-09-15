import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';

export function useSubmissionGuard() {
  const lockRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const start = () => {
    if (lockRef.current) {
      return false;
    }
    lockRef.current = true;
    setSubmitting(true);
    return true;
  };

  const finish = () => {
    lockRef.current = false;
    setSubmitting(false);
  };

  return { submitting, start, finish };
}

type SubmissionNoticeProps = {
  message: string;
};

export function SubmissionNotice({ message }: SubmissionNoticeProps) {
  return (
    <View style={styles.notice}>
      <ActivityIndicator size="small" />
      <Text style={styles.noticeText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  noticeText: {
    color: '#1D4ED8',
    flex: 1,
    fontWeight: '600',
  },
});
