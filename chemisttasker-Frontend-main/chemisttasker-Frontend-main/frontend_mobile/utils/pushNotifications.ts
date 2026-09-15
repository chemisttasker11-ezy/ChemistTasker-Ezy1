import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import apiClient from './apiClient';
import { EventEmitter } from 'eventemitter3';
import { Platform } from 'react-native';

const inAppEmitter = new EventEmitter();
const IN_APP_UNREAD_BUMP_EVENT = 'in-app-unread-bump';
const SHIFT_SLOT_ACTIVITY_EVENT = 'shift-slot-activity';


Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});


const getProjectId = () => {
  // Expo EAS projectId is required for getExpoPushTokenAsync on SDK48+.
  // Try expoConfig first; fall back to easConfig for dev client / bare.
  // @ts-ignore
  const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;

  // Log both for debugging device builds (guarded for dev only).
  if (__DEV__) {
    console.log('expoConfig projectId:', Constants?.expoConfig?.extra?.eas?.projectId);
    // @ts-ignore
    console.log('easConfig projectId:', Constants?.easConfig?.projectId);
  }

  return projectId;
};

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') {
    return null;
  }

  if (!Device.isDevice) {
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error('Missing EAS projectId for push registration');
  }
  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    { projectId }
  );
  return tokenResponse.data;
}

export async function registerDeviceTokenWithBackend(token: string, platform: 'ios' | 'android' | 'web' = 'web') {
  try {
    await apiClient.post('/client-profile/device-tokens/', {
      token,
      platform,
    });
  } catch (err) {
    const data = (err as any)?.response?.data;
    // Never wipe local auth from a push-token registration failure.
    // Auth refresh/invalid-token handling belongs to the central API interceptor.
    console.error('Failed to register device token', data || err);
  }
}

export function addNotificationResponseListener(onNavigate: () => void) {
  return Notifications.addNotificationResponseReceivedListener(() => {
    onNavigate();
  });
}

/**
 * Subscribe to notification taps that include a chat room id (roomId/conversation_id).
 * Calls onNavigate(roomId) when present.
 */
export function subscribeChatNavigation(onNavigate: (roomId: number) => void) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data: any = response?.notification?.request?.content?.data || {};
    const roomId = data.roomId ?? data.room_id ?? data.conversation_id ?? data.chat_room_id;
    if (roomId) {
      onNavigate(Number(roomId));
    }
  });
}

/**
 * Triggers an in-app event for a new message, typically from a WebSocket.
 * This is NOT for native push notifications.
 */
export function triggerUnreadBump(payload: any) {
  inAppEmitter.emit(IN_APP_UNREAD_BUMP_EVENT, payload);
}

/**
 * Subscribes to in-app new message events, typically from WebSockets.
 * This is NOT for native push notifications.
 * The callback receives a payload.
 */
export function subscribeUnreadBump(callback: (payload: any) => void) {
  inAppEmitter.on(IN_APP_UNREAD_BUMP_EVENT, callback);
  return {
    remove: () => {
      inAppEmitter.off(IN_APP_UNREAD_BUMP_EVENT, callback);
    },
  };
}

export function triggerShiftSlotActivity(payload: any) {
  inAppEmitter.emit(SHIFT_SLOT_ACTIVITY_EVENT, payload);
}

export function subscribeShiftSlotActivity(callback: (payload: any) => void) {
  inAppEmitter.on(SHIFT_SLOT_ACTIVITY_EVENT, callback);
  return {
    remove: () => {
      inAppEmitter.off(SHIFT_SLOT_ACTIVITY_EVENT, callback);
    },
  };
}

/**
 * Optional helper to fetch unread count on any notification receive (foreground/background),
 * provided the backend supports an unread endpoint.
 */
export function subscribeUnreadCount(onUnreadCount: (count: number) => void, fetchUnreadCount: () => Promise<number>) {
  return Notifications.addNotificationReceivedListener(async () => {
    try {
      const count = await fetchUnreadCount();
      onUnreadCount(count);
    } catch {
      // ignore failures
    }
  });
}
