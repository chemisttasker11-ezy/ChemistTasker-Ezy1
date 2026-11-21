import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/** Use a single configured HTTPS public origin for outward links. */
export function publicWebOrigin(configured: string | undefined = process.env.EXPO_PUBLIC_WEB_URL): string {
  if (configured) {
    try {
      const url = new URL(configured.trim());
      if (url.protocol === 'https:' && !url.username && !url.password) return url.origin;
    } catch { /* Invalid configuration must never become an unsafe link. */ }
  }
  return 'https://chemisttasker.com.au';
}

export function publicWebUrl(path: string): string {
  if (!/^\/[A-Za-z0-9/_%-]+$/.test(path) || path.includes('..') || path.includes('//')) {
    throw new Error('Unsupported public website path');
  }
  return publicWebOrigin() + path;
}

export function safePublicUrl(value: unknown, image = false): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    return (image ? ['https:', 'http:'] : ['https:', 'http:', 'mailto:']).includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

/** Legal and pricing links use the same in-app website browser. */
export async function openWebPage(path: string): Promise<void> {
  await WebBrowser.openBrowserAsync(publicWebUrl(path));
}

/** D9b: launch calculator must run on the website in the phone's normal browser. */
export async function openCalculatorWebsite(): Promise<void> {
  await Linking.openURL(publicWebUrl('/calculator'));
}
