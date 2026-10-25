'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'fi-consent-v1';
type Choice = 'granted' | 'denied';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    [k: `ga-disable-${string}`]: boolean | undefined;
  }
}

const read = (): Choice | null => {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
};
const write = (c: Choice) => {
  try {
    window.localStorage.setItem(KEY, c);
  } catch {
    /* storage unavailable: choice applies to this page view only */
  }
};

/** Private and operational routes never load analytics. */
export const analyticsRouteAllowed = (path: string) => !/^\/(admin|preview|api|asset-file|health)(\/|$)/.test(path);

/** Fire a deduplicated analytics event (no inputs, values or text are ever attached). */
export function trackEvent(name: 'calculator_use' | 'evidence_click') {
  window.dispatchEvent(new CustomEvent('fi:analytics', { detail: name }));
}

function loadGa(id: string) {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
}

function clearGaCookies() {
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]!.trim();
    if (name === '_ga' || name.startsWith('_ga_') || name === '_gid') {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.${location.hostname}`;
      document.cookie = `${name}=; Max-Age=0; path=/`;
    }
  }
}

/**
 * Consent banner and GA4 loader. Nothing from Google loads before an explicit
 * "Accept"; Accept and Decline are equal choices; the footer reopens settings.
 */
export function Consent({ measurementId, host }: { measurementId: string; host: string }) {
  const path = usePathname() ?? '/';
  const [choice, setChoice] = useState<Choice | null>(null);
  const [open, setOpen] = useState(false);
  const sent = useRef(new Set<string>());
  const eligible = typeof window !== 'undefined' && location.protocol === 'https:' && location.hostname === host;

  useEffect(() => {
    const c = read();
    setChoice(c);
    setOpen(c === null);
    const reopen = () => setOpen(true);
    window.addEventListener('fi:consent-open', reopen);
    return () => window.removeEventListener('fi:consent-open', reopen);
  }, []);

  useEffect(() => {
    if (choice !== 'granted' || !eligible || !analyticsRouteAllowed(path)) return;
    window[`ga-disable-${measurementId}`] = false;
    loadGa(measurementId);
    sent.current = new Set();
    const ref = document.referrer ? new URL(document.referrer).origin : undefined;
    window.gtag?.('event', 'page_view', { page_location: `${location.origin}${path}`, page_path: path, page_referrer: ref, page_title: document.title });
  }, [choice, path, eligible, measurementId]);

  useEffect(() => {
    const onEvent = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if (choice !== 'granted' || !eligible || !analyticsRouteAllowed(path) || sent.current.has(name)) return;
      sent.current.add(name);
      window.gtag?.('event', name, { page_path: path });
    };
    window.addEventListener('fi:analytics', onEvent);
    return () => window.removeEventListener('fi:analytics', onEvent);
  }, [choice, path, eligible]);

  const decide = useCallback(
    (c: Choice) => {
      write(c);
      setChoice(c);
      setOpen(false);
      if (c === 'denied') {
        window[`ga-disable-${measurementId}`] = true;
        clearGaCookies();
      }
    },
    [measurementId],
  );

  if (!open) return null;
  return (
    <section className="consent" aria-labelledby="consent-title" role="region">
      <h2 id="consent-title" style={{ fontSize: '1rem', margin: '0 0 6px' }}>
        Optional analytics
      </h2>
      <p className="small" style={{ marginBottom: 12 }}>
        May we use Google Analytics to count page views and anonymous tool and evidence-link use? We never send calculator inputs, questions or personal details. You can change this any time from the footer. <a href="/privacy#analytics">Privacy details</a>.
      </p>
      <div className="consent-actions">
        <button type="button" className="btn btn-secondary" onClick={() => decide('denied')}>
          Decline
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => decide('granted')}>
          Accept
        </button>
      </div>
      {choice ? <p className="small muted" style={{ margin: '8px 0 0' }}>Current choice: {choice === 'granted' ? 'accepted' : 'declined'}.</p> : null}
    </section>
  );
}

export function ConsentSettingsButton() {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      style={{ padding: '5px 0', minHeight: 0, color: 'var(--neutral-text)', fontWeight: 400 }}
      onClick={() => window.dispatchEvent(new Event('fi:consent-open'))}
    >
      Analytics settings
    </button>
  );
}
