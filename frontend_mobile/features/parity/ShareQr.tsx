import React, { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import Svg, { Path, Rect } from 'react-native-svg';
import { useWindowDimensions } from 'react-native';
import { InfoNote } from './ParityUI';

type Kind = 'worker' | 'pharmacy-invite' | 'organization';
export function shareQrTarget(kind: Kind, value: string, origin: string): string | null {
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) return null;
  } catch { return null; }
  if (kind === 'worker' && /^[A-Za-z0-9_-]{4,100}$/.test(value)) return origin + '/talent/public-board?reference_code=' + encodeURIComponent(value);
  if (kind === 'pharmacy-invite' && /^[A-Za-z0-9_-]{8,200}$/.test(value)) return origin + '/membership/apply/' + value;
  if (kind === 'organization' && /^[A-Za-z0-9_-]{4,100}$/.test(value)) return origin + '/organization/' + value;
  return null;
}
export function ShareQr({ kind, value, origin }: { kind: Kind; value: string; origin: string }) {
  const { width } = useWindowDimensions();
  const target = shareQrTarget(kind, value, origin);
  const matrix = useMemo(() => {
    if (!target) return null;
    const qr = qrcode(0, 'M'); qr.addData(target); qr.make();
    const count = qr.getModuleCount(); let path = '';
    for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) if (qr.isDark(y, x)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
    return { count: count + 8, path };
  }, [target]);
  if (!matrix) return <InfoNote title="Unable to show QR code">This code is invalid or has expired.</InfoNote>;
  const size = Math.min(240, width * 0.6);
  const label = kind === 'worker' ? 'Worker profile QR code' : kind === 'pharmacy-invite' ? 'Pharmacy invitation QR code' : 'Organisation QR code';
  return <>
    <Svg accessibilityLabel={label} accessibilityRole="image" style={{ alignSelf: 'center' }} width={size} height={size} viewBox={`0 0 ${matrix.count} ${matrix.count}`}><Rect width="100%" height="100%" fill="white" /><Path d={matrix.path} fill="black" /></Svg>
    {kind === 'pharmacy-invite' ? <InfoNote title="Sharing invitations">Sharing this code does not approve employment or add a favourite. Membership applications still require the existing review and approval steps. Share invitation tokens only with intended applicants.</InfoNote> : null}
  </>;
}
