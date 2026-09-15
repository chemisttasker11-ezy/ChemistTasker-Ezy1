import { Metadata } from 'next';
import Listing, { SearchParams } from '../components/listing';
import { site } from '../../../lib/hub';
export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const filters = await searchParams;
  return { title: 'Pharmacy insights & practical guides | ChemistTasker Blog', description: 'Ideas, guides and stories for Australian pharmacy professionals. Read the ChemistTasker journal and join the conversation.', alternates: { canonical: `${site}/blog` }, robots: filters.q || filters.topic || filters.page ? { index: false, follow: true } : undefined };
}
export default async function Blog({ searchParams }: { searchParams: Promise<SearchParams> }) { return <Listing kind="blog" filters={await searchParams}/>; }
