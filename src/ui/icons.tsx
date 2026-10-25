import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export const IconCheck = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
export const IconQuestion = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2.2-2.4 3.7" />
    <path d="M12 17h.01" />
  </svg>
);
export const IconAlert = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3 2 21h20L12 3z" />
    <path d="M12 10v4" />
    <path d="M12 18h.01" />
  </svg>
);
export const IconInfo = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6" />
    <path d="M12 7h.01" />
  </svg>
);
export const IconClock = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const IconX = (p: P) => (
  <svg {...base} {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);
export const IconMenu = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
  </svg>
);
export const IconSearch = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const IconExternal = (p: P) => (
  <svg {...base} width={14} height={14} {...p}>
    <path d="M14 4h6v6" />
    <path d="M10 14 20 4" />
    <path d="M20 14v6H4V4h6" />
  </svg>
);
export const IconShield = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z" />
  </svg>
);

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="#1D4ED8" />
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
  );
}
