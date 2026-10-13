import fred from './software-logos/fred.svg';
import rxone from './software-logos/rxone.svg';
import strongroom from './software-logos/strongroom.png';
import minfos from './software-logos/minfos.png';
import zsoftware from './software-logos/zsoftware.png';
import medimap from './software-logos/medimap.png';
import mypak from './software-logos/mypak.png';
import mpsconnect from './software-logos/mpsconnect.png';
import dispenseworks from './software-logos/dispenseworks.png';
import webstercare from './software-logos/webstercare.png';

// Vite imports an asset as a URL string; Next as { src }.
type Asset = string | { src: string };
const MARKS: Record<string, Asset> = { fred, rxone, strongroom, minfos, zsoftware, medimap, mypak, mpsconnect, dispenseworks, webstercare };
const url = (asset: Asset) => (typeof asset === 'string' ? asset : asset.src);

export const hasSoftwareMark = (logo?: string) => Boolean(logo && MARKS[logo]);

/** The vendor's own compact mark (app icon or logo mark), unaltered, on a white tile. The product name stays visible beside it. */
export function SoftwareMark({ logo, size = 20 }: { logo: string; size?: number }) {
  const asset = MARKS[logo];
  if (!asset) return null;
  return (
    <span aria-hidden="true" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxSizing: 'border-box',
      width: size, height: size, borderRadius: Math.round(size * 0.24), background: '#FFFFFF',
      border: '1px solid rgba(6, 33, 74, 0.14)', verticalAlign: 'middle', overflow: 'hidden',
    }}>
      <img src={url(asset)} alt="" width={size - 4} height={size - 4} style={{ width: size - 4, height: size - 4, objectFit: 'contain', display: 'block' }} />
    </span>
  );
}
