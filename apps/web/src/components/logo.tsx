import Link from 'next/link';
import { useId } from 'react';
export function Brand({ compact = false, href = '/login' }: { compact?: boolean; href?: string }) {
  const id = useId();
  return (
    <Link href={href} className="brand" aria-label="MarketPilot AI início">
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 82 62" fill="none">
          <defs>
            <linearGradient id={id} x1="15" y1="8" x2="62" y2="60" gradientUnits="userSpaceOnUse">
              <stop stopColor="#D9A3FF" />
              <stop offset=".42" stopColor="#A855F7" />
              <stop offset=".74" stopColor="#7C3AED" />
              <stop offset="1" stopColor="#4C168D" />
            </linearGradient>
          </defs>
          <path
            d="M12 49 27 15Q28 12 30 15L44 36 69 14Q72 11 71 15L62 47"
            stroke={`url(#${id})`}
            strokeWidth="15"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!compact && (
        <span>
          MarketPilot<span className="brand-ai">AI</span>
        </span>
      )}
    </Link>
  );
}
