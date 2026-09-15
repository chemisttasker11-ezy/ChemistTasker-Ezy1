import {SessionProvider} from '@/shared/session-provider';
import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://chemisttasker.com.au'),
  title: 'Locum pharmacist shifts & pharmacy staffing | ChemistTasker',
  description: 'Find locum pharmacist shifts and pharmacy talent in Australia. Connect availability, hiring, team workspaces and public pharmacy communities with one ChemistTasker account.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-AU" data-scroll-behavior="smooth"><body><SessionProvider>{children}</SessionProvider></body></html>;
}
