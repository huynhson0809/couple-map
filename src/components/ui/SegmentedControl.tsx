import type { ReactNode } from 'react'
import { cx } from './uiClasses'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  disabled?: boolean
}

interface Props<T extends string> {
  value: T
  options: Array<SegmentedOption<T>>
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  label: string
  className?: string
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  label,
  className = '',
}: Props<T>) {
  return (
    <div className={cx('lg-segmented', `lg-segmented-${size}`, className)} role="group" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            className={cx('lg-segmented-option', active && 'active')}
            aria-pressed={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
