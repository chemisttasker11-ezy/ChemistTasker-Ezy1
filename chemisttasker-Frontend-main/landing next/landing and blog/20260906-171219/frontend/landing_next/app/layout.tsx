import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChemistTasker | Your pharmacy workforce, connected',
  description: 'Bring shifts, availability, pharmacy teams and everyday operations together. Discover ChemistTasker for pharmacy owners, pharmacists and staff.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-AU"><body>{children}</body></html>;
}
