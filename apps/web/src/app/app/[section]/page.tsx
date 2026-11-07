import { notFound, redirect } from 'next/navigation';
import { FeaturePage } from '@/components/feature-page';
import { pages } from '@/lib/navigation';
export default async function AppSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === 'demo') redirect('/demo');
  if (!pages.some((p) => p.slug === section && p.slug !== '')) notFound();
  return <FeaturePage slug={section} demo={false} />;
}
