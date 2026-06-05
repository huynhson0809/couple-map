import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './uiClasses'

type IconButtonSize = 'sm' | 'md' | 'lg'
type IconButtonVariant = 'glass' | 'ghost' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: IconButtonSize
  variant?: IconButtonVariant
  children: ReactNode
}

export function IconButton({
  label,
  size = 'md',
  variant = 'glass',
  className = '',
  children,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      className={cx('lg-icon-button', `lg-icon-button-${size}`, `lg-icon-button-${variant}`, className)}
    >
      {children}
    </button>
  )
}
