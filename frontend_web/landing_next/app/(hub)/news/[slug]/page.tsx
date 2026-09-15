import ArticleDetail, { articleMetadata } from '../../components/article-detail';
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) { return articleMetadata((await params).slug, 'news'); }
export default async function Page({ params }: Props) { return <ArticleDetail slug={(await params).slug} kind="news"/>; }
