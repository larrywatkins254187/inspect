import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ForexInspect',
    short_name: 'ForexInspect',
    description: 'Evidence-first forex broker research, calculators and guides.',
    start_url: '/',
    display: 'browser',
    background_color: '#F4F9FF',
    theme_color: '#1D4ED8',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
