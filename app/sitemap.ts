import type { MetadataRoute } from 'next';
import { absolute } from '@/server/seo';
import { discoveryEntries } from '@/server/discovery';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return (await discoveryEntries()).map((e) => ({ url: absolute(e.path), lastModified: e.lastModified }));
}
