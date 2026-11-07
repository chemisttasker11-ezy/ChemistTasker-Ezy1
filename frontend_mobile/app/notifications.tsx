import React from 'react';
import NotificationsScreen from '../features/notifications/NotificationsScreen';
import { RootPageHeader } from '@/components/RootPageHeader';

export default function RootNotifications() {
  return (
    <>
      <RootPageHeader title="Notifications" />
      <NotificationsScreen />
    </>
  );
}
