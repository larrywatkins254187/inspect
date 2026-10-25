import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { config } from '@/config/env';
import { SITE_NAME, SITE_TAGLINE } from '@/content/site';
import { Consent } from '@/ui/client/Consent';
import { SiteFooter } from '@/ui/SiteFooter';
import { SiteHeader } from '@/ui/SiteHeader';
import './globals.css';

const inter = localFont({
  src: './fonts/inter-latin-wght.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL(config().siteUrl),
  title: { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s | ${SITE_NAME}` },
  description:
    'Inspect forex-broker claims with dated, scoped primary evidence. No ratings, rankings, recommendations or affiliate links.',
  applicationName: SITE_NAME,
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: '#F4F9FF',
  width: 'device-width',
  initialScale: 1,
};

/**
 * Motion enhancement: only elements that start *below* the viewport are hidden
 * and then revealed once; observers disconnect after use. Skipped entirely for
 * reduced motion or missing IntersectionObserver — content is never hidden first.
 */
const MOTION = `(()=>{try{if(matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver'in window))return;var els=[].slice.call(document.querySelectorAll('.reveal'));var h=innerHeight;var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.remove('reveal-pending');io.unobserve(e.target)}})},{rootMargin:'0px 0px -40px 0px'});els.forEach(function(el){if(el.getBoundingClientRect().top>h){el.classList.add('reveal-pending');io.observe(el)}});setTimeout(function(){els.forEach(function(el){el.classList.remove('reveal-pending')});io.disconnect()},4000)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cfg = config();
  const analytics = cfg.analytics.enabled && cfg.analytics.measurementId ? cfg.analytics.measurementId : null;
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter analyticsOffered={!!analytics} />
        {analytics ? <Consent measurementId={analytics} host={new URL(cfg.siteUrl).hostname} /> : null}
        <script dangerouslySetInnerHTML={{ __html: MOTION }} />
      </body>
    </html>
  );
}
