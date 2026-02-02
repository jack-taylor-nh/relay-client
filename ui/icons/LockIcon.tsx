interface LockIconProps {
  size?: number;
  className?: string;
}

export function LockIcon({ size = 16, className = '' }: LockIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="4" y="10" width="16" height="12" rx="2" />
      <path d="M8 10V6a4 4 0 118 0v4" />
    </svg>
  );
}
