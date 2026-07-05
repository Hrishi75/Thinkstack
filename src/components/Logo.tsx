/**
 * Thinkstack mark — same artwork as the app icon (src-tauri/icons/icon.svg),
 * cropped to fill the tile and with the shadow dropped for small sizes.
 */
export default function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Thinkstack"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="ts-logo-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4FA3F0" />
          <stop offset="1" stopColor="#1E6FD6" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="228" fill="url(#ts-logo-bg)" />
      <g transform="translate(512 512) scale(1.18) translate(-512 -512)">
        <rect x="352" y="286" width="320" height="220" rx="34" fill="#ffffff" opacity="0.32" />
        <rect x="316" y="358" width="392" height="240" rx="38" fill="#ffffff" opacity="0.55" />
        <rect x="280" y="436" width="464" height="302" rx="42" fill="#ffffff" />
        <rect x="340" y="512" width="264" height="36" rx="18" fill="#2383E2" />
        <rect x="340" y="584" width="344" height="26" rx="13" fill="#9DBEE2" />
        <rect x="340" y="642" width="296" height="26" rx="13" fill="#C2D6ED" />
        <path
          d="M760 244 l24 62 62 24 -62 24 -24 62 -24 -62 -62 -24 62 -24 z"
          fill="#FFD84D"
        />
      </g>
    </svg>
  );
}
