import type { MetadataRoute } from 'next';
import { config } from '@/config/env';

export default function robots(): MetadataRoute.Robots {
  const base = config().siteUrl;
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/admin', '/preview', '/api/', '/asset-file/', '/health'] },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
