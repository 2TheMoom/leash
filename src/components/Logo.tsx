interface LogoMarkProps {
  size?: number
  className?: string
}

/** The Handle L mark: a loop you hold, rope running down and turning, orange dot at the end. */
export function LogoMark({ size = 34, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle cx="22" cy="17" r="8" fill="none" stroke="currentColor" strokeWidth="5" />
      <path
        d="M22 25 V43 Q22 51 30 51 H44"
        fill="none"
        stroke="#2A3BFF"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="51" cy="51" r="5.5" fill="#FF5A1F" />
    </svg>
  )
}

interface LogoProps {
  size?: number
  className?: string
  /** White wordmark for dark backgrounds */
  light?: boolean
}

export function Logo({ size = 34, className, light }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-[10px] ${className ?? ''}`}>
      <LogoMark size={size} />
      <span
        style={{
          fontFamily: "'Archivo', system-ui, sans-serif",
          fontWeight: 900,
          fontStretch: '125%',
          fontSize: size * 0.65,
          lineHeight: 1,
          letterSpacing: '-0.01em',
          color: light ? '#fff' : 'var(--ink)',
        }}
      >
        LEASH
      </span>
    </span>
  )
}
