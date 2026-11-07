import React from "react";

// Kuwait City waterfront at dusk (Kuwait Towers, Liberation Tower, Al Hamra) drawn as a scalable background.
export default function KuwaitSkyline({ className = "" }) {
  const towers = [
    // [x, width, height] generic city blocks behind the landmarks
    [20, 46, 210], [72, 34, 160], [110, 40, 230], [150, 38, 190],
    [600, 44, 240], [650, 58, 320], [714, 36, 200], [756, 64, 270], [826, 40, 230], [872, 70, 340],
    [948, 46, 260], [1000, 52, 210], [1058, 40, 290], [1104, 66, 240], [1176, 44, 200], [1226, 60, 260],
  ];
  const H = 900; const shore = 640;
  return (
    <svg viewBox={`0 0 1300 ${H}`} preserveAspectRatio="xMidYMax slice" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d2240" />
          <stop offset="0.45" stopColor="#2b5c8f" />
          <stop offset="0.75" stopColor="#d9a873" />
          <stop offset="1" stopColor="#f1cf9b" />
        </linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3f6f96" />
          <stop offset="1" stopColor="#0c1e33" />
        </linearGradient>
        <linearGradient id="far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a6a8c" />
          <stop offset="1" stopColor="#7d8fa3" />
        </linearGradient>
        <linearGradient id="near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b3352" />
          <stop offset="1" stopColor="#10233b" />
        </linearGradient>
        <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff2d1" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff2d1" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sphere" cx="0.38" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#5fa3b8" />
          <stop offset="0.55" stopColor="#1f5a78" />
          <stop offset="1" stopColor="#123552" />
        </radialGradient>
        <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0V48" fill="none" stroke="#fff" strokeOpacity="0.05" />
        </pattern>
      </defs>

      <rect width="1300" height={H} fill="url(#sky)" />
      <rect width="1300" height={shore} fill="url(#grid)" />
      <circle cx="980" cy={shore - 70} r="190" fill="url(#sun)" />

      {/* distant skyline */}
      <g fill="url(#far)" opacity="0.75">
        {towers.map(([x, w, h], i) => <rect key={i} x={x + 14} y={shore - h * 0.7} width={w * 0.8} height={h * 0.7} />)}
      </g>

      {/* city blocks with window lights */}
      <g fill="url(#near)">
        {towers.map(([x, w, h], i) => <rect key={i} x={x} y={shore - h * 0.55} width={w} height={h * 0.55} />)}
      </g>
      <g fill="#f6d48f" opacity="0.55">
        {towers.flatMap(([x, w, h], i) =>
          Array.from({ length: Math.floor((h * 0.55) / 26) }, (_, r) => (
            <rect key={`${i}-${r}`} x={x + 6} y={shore - h * 0.55 + 12 + r * 26} width={w - 12} height="3" opacity={(i + r) % 3 ? 0.35 : 0.9} />
          )))}
      </g>

      {/* Al Hamra tower (twisted cut) */}
      <path d={`M470 ${shore} L470 ${shore - 360} Q482 ${shore - 420} 520 ${shore - 430} L520 ${shore} Z`} fill="#152b47" />
      <path d={`M488 ${shore} L488 ${shore - 330} Q496 ${shore - 380} 520 ${shore - 400}`} fill="none" stroke="#2f5379" strokeWidth="3" />

      {/* Liberation Tower */}
      <g fill="#132840">
        <rect x="392" y={shore - 300} width="30" height="300" />
        <path d={`M384 ${shore - 300} L430 ${shore - 300} L422 ${shore - 340} L392 ${shore - 340} Z`} />
        <rect x="397" y={shore - 380} width="20" height="42" rx="4" />
        <rect x="405" y={shore - 470} width="4" height="92" />
      </g>

      {/* Kuwait Towers */}
      <g>
        <rect x="355" y={shore - 470} width="9" height="470" fill="#122640" />
        <rect x="358.5" y={shore - 535} width="2" height="70" fill="#122640" />
        <circle cx="359.5" cy={shore - 330} r="44" fill="url(#sphere)" />
        <circle cx="359.5" cy={shore - 450} r="23" fill="url(#sphere)" />
        <rect x="302" y={shore - 380} width="7" height="380" fill="#122640" />
        <circle cx="305.5" cy={shore - 230} r="30" fill="url(#sphere)" />
        <rect x="244" y={shore - 170} width="5" height="170" fill="#122640" />
      </g>

      {/* shoreline + sea with reflections */}
      <rect x="0" y={shore} width="1300" height="10" fill="#0f2238" />
      <rect x="0" y={shore + 10} width="1300" height={H - shore - 10} fill="url(#sea)" />
      <g fill="#f6d48f" opacity="0.35">
        {Array.from({ length: 14 }, (_, i) => (
          <rect key={i} x={880 + ((i * 37) % 200)} y={shore + 22 + i * 14} width={120 - i * 6} height="2.5" rx="1" />
        ))}
      </g>
      <g fill="#1d4a6b" opacity="0.35">
        <ellipse cx="359.5" cy={shore + 70} rx="40" ry="12" />
        <rect x="355" y={shore + 10} width="9" height="120" />
      </g>
    </svg>
  );
}
