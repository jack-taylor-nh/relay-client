/**
 * Relay Logo Icon
 * 
 * Based on official relay-master.svg iconpack with gradient colors:
 * - Cyan (#22D3EE)
 * - Purple (#8B5CF6)
 * - Emerald (#10B981)
 */

interface RelayLogoProps {
  size?: number;
  className?: string;
  variant?: 'gradient' | 'monochrome';
}

export function RelayLogo({ size = 24, className = '', variant = 'gradient' }: RelayLogoProps) {
  if (variant === 'monochrome') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M16 4L4 10v12l12 6 12-6V10L16 4z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="16" r="4" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="relay-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="50%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
      </defs>
      <path
        d="M16 4L4 10v12l12 6 12-6V10L16 4z"
        stroke="url(#relay-gradient)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="4" fill="#8B5CF6" />
    </svg>
  );
}
