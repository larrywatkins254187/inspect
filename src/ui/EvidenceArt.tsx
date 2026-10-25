/**
 * Lightweight static SVG of the evidence workflow (official page → two readings →
 * accepted fact → page). Illustrative only: it shows no broker, data or chart.
 */
export function EvidenceArt() {
  return (
    <svg className="evidence-art" viewBox="0 0 480 360" role="img" aria-labelledby="art-title art-desc">
      <title id="art-title">How a claim becomes a published fact</title>
      <desc id="art-desc">An official broker page is read twice; matching readings become one accepted, dated fact that a research page cites.</desc>
      <defs>
        <linearGradient id="art-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EAF4FF" />
          <stop offset="1" stopColor="#F4F9FF" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="472" height="352" rx="24" fill="url(#art-bg)" stroke="#B9D5F5" />
      <g fontFamily="inherit" fontSize="13" fill="#0F172A">
        <rect x="28" y="36" width="150" height="112" rx="14" fill="#fff" stroke="#B9D5F5" />
        <rect x="44" y="54" width="70" height="8" rx="4" fill="#B9D5F5" />
        <rect x="44" y="72" width="118" height="6" rx="3" fill="#DCECFF" />
        <rect x="44" y="86" width="104" height="6" rx="3" fill="#DCECFF" />
        <rect x="44" y="100" width="112" height="14" rx="4" fill="#DBEAFE" stroke="#1D4ED8" />
        <text x="44" y="138" fill="#475569">Official page</text>
        <path d="M178 92 C 214 92, 214 70, 248 70" stroke="#0369A1" strokeWidth="2" fill="none" strokeDasharray="4 4" />
        <path d="M178 92 C 214 92, 214 130, 248 130" stroke="#0369A1" strokeWidth="2" fill="none" strokeDasharray="4 4" />
        <rect x="248" y="48" width="112" height="44" rx="12" fill="#fff" stroke="#B9D5F5" />
        <text x="262" y="75">Reading A</text>
        <rect x="248" y="108" width="112" height="44" rx="12" fill="#fff" stroke="#B9D5F5" />
        <text x="262" y="135">Reading B</text>
        <path d="M360 70 C 400 70, 400 100, 420 160" stroke="#1D4ED8" strokeWidth="2" fill="none" />
        <path d="M360 130 C 392 130, 404 140, 420 160" stroke="#1D4ED8" strokeWidth="2" fill="none" />
        <rect x="292" y="176" width="164" height="72" rx="14" fill="#fff" stroke="#1D4ED8" strokeWidth="1.5" />
        <circle cx="314" cy="200" r="10" fill="#DCFCE7" stroke="#166534" />
        <path d="m309 200 4 4 6-8" stroke="#166534" strokeWidth="2" fill="none" strokeLinecap="round" />
        <text x="332" y="205" fontWeight="700">Accepted fact</text>
        <text x="308" y="230" fill="#475569" fontSize="12">scope · source · dates</text>
        <path d="M292 212 C 240 212, 220 250, 196 262" stroke="#1D4ED8" strokeWidth="2" fill="none" />
        <rect x="28" y="196" width="168" height="132" rx="14" fill="#fff" stroke="#B9D5F5" />
        <rect x="44" y="214" width="96" height="10" rx="5" fill="#0F172A" opacity="0.85" />
        <rect x="44" y="236" width="136" height="6" rx="3" fill="#DCECFF" />
        <rect x="44" y="250" width="120" height="6" rx="3" fill="#DCECFF" />
        <rect x="44" y="268" width="62" height="18" rx="9" fill="#EAF4FF" stroke="#B9D5F5" />
        <rect x="112" y="268" width="62" height="18" rx="9" fill="#EAF4FF" stroke="#B9D5F5" />
        <text x="44" y="314" fill="#475569">Research page cites it</text>
        <text x="300" y="290" fill="#475569" fontSize="12">Expires → re-checked</text>
        <path d="M374 248 v 26" stroke="#0369A1" strokeWidth="2" strokeDasharray="3 4" />
      </g>
    </svg>
  );
}
