import { Metadata } from 'next';
import Listing, { SearchParams } from '../components/listing';
import { site } from '../../../lib/hub';
export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const filters = await searchParams;
  return { title: 'Pharmacy news & community | ChemistTasker', description: 'Follow Australian pharmacy industry news, TGA updates and career stories. Share your perspective in the public ChemistTasker hub.', alternates: { canonical: `${site}/news` }, robots: filters.q || filters.topic || filters.page ? { index: false, follow: true } : undefined };
}
export default async function News({ searchParams }: { searchParams: Promise<SearchParams> }) { return <Listing kind="news" filters={await searchParams}/>; }
