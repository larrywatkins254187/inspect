import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1D4ED8',
        borderRadius: 40,
      }}
    >
      <svg width="120" height="120" viewBox="0 0 32 32">
        <circle cx="14" cy="14" r="7" fill="none" stroke="#fff" strokeWidth="2.5" />
        <path d="m19.5 19.5 5 5" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />
        <path
          d="M10.5 14.2 13 16.5l4-5"
          fill="none"
          stroke="#BAE6FD"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>,
    size,
  );
}
