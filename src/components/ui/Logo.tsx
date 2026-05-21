interface Props {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

export function Logo({
  size = 56,
  withWordmark = false,
  className = "",
}: Props) {
  return (
    <div className={`logo ${withWordmark ? "with-text" : ""} ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 72 72"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Pinly"
      >
        <defs>
          <linearGradient id="pinly-pin" x1="18" y1="8" x2="54" y2="64">
            <stop offset="0%" stopColor="#ff676d" />
            <stop offset="100%" stopColor="#ff4d57" />
          </linearGradient>
        </defs>
        <ellipse cx="36" cy="58" rx="15" ry="5" fill="#1f1f1f" opacity="0.14" />
        <path
          d="M36 62 L20 46 L36 37 L52 46 Z"
          fill="#d84349"
          opacity="0.62"
        />
        <path
          d="M36 6 C 20.5 6, 9 17.6, 9 32.5 C 9 47.8, 36 66, 36 66 C 36 66, 63 47.8, 63 32.5 C 63 17.6, 51.5 6, 36 6 Z"
          fill="url(#pinly-pin)"
        />
        <circle cx="36" cy="31" r="14" fill="#fff7f7" />
        <circle cx="36" cy="31" r="9" fill="#ffd1d4" />
        <path
          d="M36 62 L30 51 L36 47 L42 51 Z"
          fill="#ff5a5f"
          opacity="0.9"
        />
      </svg>
      {withWordmark && (
        <span className="logo-wordmark">Pinly</span>
      )}
    </div>
  );
}
