import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Paediatric anti-infectives | ChemistTasker', description: 'A source-linked paediatric anti-infective calculator for health professionals. Local development preview.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en-AU"><body>{children}</body></html>; }
