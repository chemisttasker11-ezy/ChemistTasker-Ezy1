import { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';

/** Only internal published listing and pre-existing server invitation endpoints are QR-encoded. */
function resolveTarget(search: string, origin: string): { label: string; url: string } | null {
  const p = new URLSearchParams(search);
  const kind = p.get('kind');
  if (kind === 'worker' && [...p.keys()].length === 2) {
    const code = p.get('reference_code') || '';
    if (/^[A-Za-z0-9_-]{4,100}$/.test(code)) return {
      label: 'Public worker listing',
      url: origin + '/talent/public-board?reference_code=' + encodeURIComponent(code),
    };
  }
  if (kind === 'pharmacy-invite' && [...p.keys()].length === 2) {
    const token = p.get('token') || '';
    if (/^[A-Za-z0-9_-]{8,200}$/.test(token)) return {
      label: 'Pharmacy membership application',
      url: origin + '/membership/apply/' + token,
    };
  }
  if (kind === 'organization' && [...p.keys()].length === 2) {
    const slug = p.get('slug') || '';
    if (/^[A-Za-z0-9_-]{4,100}$/.test(slug)) return {
      label: 'Public organisation profile',
      url: origin + '/organization/' + slug,
    };
  }
  return null;
}

export default function ShareQrPage() {
  const target = useMemo(() => resolveTarget(window.location.search, window.location.origin), []);
  return <main style={{ maxWidth: 560, margin: '2rem auto', padding: 24, fontFamily: 'Inter, sans-serif', color: '#06214a', display: 'grid', gap: 22 }}>
    <a href="/" style={{ color: '#5222b8' }}>ChemistTasker home</a>
    <h1 style={{ fontSize: 30, margin: 0 }}>Share a ChemistTasker code</h1>
    {!target ? <p role="alert">This code is invalid or is no longer supported. No membership action was taken.</p> : <>
      <p>Show this QR to someone in the ChemistTasker mobile app, or copy the link below.</p>
      <div style={{ background: '#fff', border: '1px solid #dae1ef', borderRadius: 18, padding: 24, width: 'fit-content', maxWidth: '100%' }} aria-label={'QR code for ' + target.label}>
        <QRCodeSVG value={target.url} size={256} marginSize={3} />
      </div>
      <h2 style={{ fontSize: 18 }}>{target.label}</h2>
      <a style={{ color: '#5222b8', overflowWrap: 'anywhere' }} href={target.url}>{target.url}</a>
      <p style={{ fontSize: 14 }}>Sharing this code does not approve employment or add a favourite. Membership applications still require the existing review and approval steps. Share invitation tokens only with intended applicants.</p>
      <button type="button" onClick={() => void navigator.clipboard?.writeText(target.url)} style={{ background: '#5222b8', border: 0, color: '#fff', borderRadius: 10, minHeight: 48, padding: '12px 18px', maxWidth: 240 }}>Copy link</button>
    </>}
  </main>;
}
