/** Shuffle (two crossing arrows) and dice icons for the Shuffle / Random buttons. */
export function ShuffleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h3c5 0 7 10 12 10h3M3 17h3c1.6 0 2.8-.7 3.8-1.7M14.2 8.7C15.2 7.7 16.4 7 18 7h3" />
      <path d="M18 4l3 3-3 3M18 14l3 3-3 3" />
    </svg>
  );
}
export function DiceIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <circle cx="8.5" cy="8.5" r="1" fill="currentColor" /><circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="8.5" cy="15.5" r="1" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1" fill="currentColor" />
    </svg>
  );
}

/** Podcast-style "jump 10 seconds" icons: a circular arrow with 10 inside. */
function Jump10({ className, forward }: { className: string; forward?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <g transform={forward ? "translate(24 0) scale(-1 1)" : undefined}>
        <path d="M9 5h3a8 8 0 1 1-7.4 5" />
        <path d="M12.5 1.5L9 5l3.5 3.5" />
      </g>
      <text x="12" y="16.2" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" stroke="none" fontFamily="system-ui, sans-serif">10</text>
    </svg>
  );
}
export const Back10Icon = ({ className = "h-8 w-8" }: { className?: string }) => <Jump10 className={className} />;
export const Forward10Icon = ({ className = "h-8 w-8" }: { className?: string }) => <Jump10 className={className} forward />;
