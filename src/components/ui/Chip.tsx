import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { X } from 'lucide-react'
import { cx } from './uiClasses'

type Tone = 'coral' | 'neutral' | 'success' | 'warning' | 'custom'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  tone?: Tone
  leadingIcon?: ReactNode
  removable?: boolean
  onRemove?: () => void
}

export function Chip({
  selected = false,
  tone = 'neutral',
  leadingIcon,
  removable = false,
  onRemove,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: Props) {
  const chipClass = cx('lg-chip', `lg-chip-${tone}`, selected && 'lg-chip-selected', removable && 'lg-chip-removable', disabled && 'lg-chip-disabled', className)
  const content = (
    <>
      {leadingIcon && <span className="lg-chip-icon" aria-hidden="true">{leadingIcon}</span>}
      <span className="lg-chip-label">{children}</span>
    </>
  )

  if (removable) {
    return (
      <span className={chipClass} aria-disabled={disabled || undefined}>
        <button
          {...rest}
          type={type}
          aria-pressed={selected}
          className="lg-chip-main"
          disabled={disabled}
        >
          {content}
        </button>
        <button
          type="button"
          className="lg-chip-remove"
          aria-label="Remove"
          onClick={onRemove}
          disabled={disabled || !onRemove}
        >
          <X size={12} />
        </button>
      </span>
    )
  }

  return (
    <button
      {...rest}
      type={type}
      aria-pressed={selected}
      className={chipClass}
      disabled={disabled}
    >
      {content}
    </button>
  )
}
