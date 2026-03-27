/** Receipt-scanner logo for Snapense */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Receipt body */}
      <path
        d="M16 8h32a2 2 0 0 1 2 2v44l-6-4-6 4-6-4-6 4-6-4-6 4V10a2 2 0 0 1 2-2z"
        fill="#0969da"
        opacity="0.12"
        stroke="#0969da"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Text lines on receipt */}
      <line x1="22" y1="20" x2="42" y2="20" stroke="#0969da" strokeWidth="2" strokeLinecap="round" />
      <line x1="22" y1="27" x2="38" y2="27" stroke="#0969da" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <line x1="22" y1="34" x2="35" y2="34" stroke="#0969da" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      {/* Total line (bold) */}
      <line x1="22" y1="42" x2="42" y2="42" stroke="#0969da" strokeWidth="2.5" strokeLinecap="round" />
      {/* Scan beam */}
      <rect x="12" y="28" width="40" height="3" rx="1.5" fill="#1a7f37" opacity="0.7" />
    </svg>
  );
}
