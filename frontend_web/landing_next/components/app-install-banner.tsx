'use client';
import { usePathname } from 'next/navigation';
import MobileInstallPrompt from '../../src/components/MobileInstallPrompt';

export default function AppInstallBanner() {
  const path = usePathname() || '/';
  return <MobileInstallPrompt path={path} />;
}
