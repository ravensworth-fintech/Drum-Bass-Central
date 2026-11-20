/** Small "list with a plus" icon for the Add to Up Next buttons. */
export function QueueIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h12M3 12h8M3 18h8" />
      <path d="M17 13v8M13 17h8" />
    </svg>
  );
}
