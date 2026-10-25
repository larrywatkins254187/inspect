import { ImageResponse } from 'next/og';

export const alt = 'ForexInspect — evidence-first forex broker research';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, background: '#F4F9FF', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 96, height: 96, borderRadius: 24, background: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="64" height="64" viewBox="0 0 32 32">
              <circle cx="14" cy="14" r="7" fill="none" stroke="#fff" strokeWidth="2.5" />
              <path d="m19.5 19.5 5 5" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ fontSize: 64, fontWeight: 800, color: '#0F172A' }}>ForexInspect</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 44, color: '#0F172A', maxWidth: 980 }}>Evidence-first forex broker research</div>
        <div style={{ marginTop: 20, fontSize: 28, color: '#475569', maxWidth: 1000 }}>Dated, scoped facts from official sources · calculators · guides · no ratings or affiliate links</div>
      </div>
    ),
    size,
  );
}
