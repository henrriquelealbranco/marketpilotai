import { notFound, redirect } from 'next/navigation';
import { FeaturePage } from '@/components/feature-page';
import { pages } from '@/lib/navigation';
export default async function CatalogSection({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  const query = await searchParams;
  if (section === 'demo') redirect('/demo');
  if (!pages.some((p) => p.slug === section && p.slug !== '')) notFound();
  return (
    <FeaturePage
      slug={section}
      demo={false}
      supplierFilter={typeof query.fornecedor === 'string' ? query.fornecedor : undefined}
    />
  );
}
