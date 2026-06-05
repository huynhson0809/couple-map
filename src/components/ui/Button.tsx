import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cx } from './uiClasses'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon'
type Tone = 'coral' | 'neutral' | 'success' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  tone?: Tone
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  tone,
  leadingIcon,
  trailingIcon,
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: Props) {
  const resolvedTone = tone ?? (variant === 'danger' ? 'danger' : variant === 'secondary' || variant === 'ghost' ? 'neutral' : 'coral')
  const hasChildren = children !== undefined && children !== null

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'btn',
        'lg-button',
        `lg-button-${variant}`,
        `lg-button-size-${size}`,
        `lg-button-tone-${resolvedTone}`,
        loading && 'lg-button-loading',
        className,
      )}
    >
      {loading && <Loader2 size={16} className="lg-button-spinner" aria-hidden="true" />}
      {!loading && leadingIcon && <span className="lg-button-icon" aria-hidden="true">{leadingIcon}</span>}
      {hasChildren && <span className="lg-button-label">{children}</span>}
      {!loading && trailingIcon && <span className="lg-button-icon" aria-hidden="true">{trailingIcon}</span>}
    </button>
  )
}
