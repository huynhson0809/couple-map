import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cx } from './uiClasses'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  hint?: string
  error?: string
  leadingIcon?: ReactNode
  trailingAction?: ReactNode
}

export function TextField({
  id,
  label,
  hint,
  error,
  leadingIcon,
  trailingAction,
  className = '',
  ...rest
}: Props) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const descriptionId = error || hint ? `${inputId}-description` : undefined
  const describedBy = [rest['aria-describedby'], descriptionId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cx('lg-field', error && 'lg-field-error', className)}>
      {label && <label className="lg-field-label" htmlFor={inputId}>{label}</label>}
      <span className="lg-field-control">
        {leadingIcon && <span className="lg-field-icon" aria-hidden="true">{leadingIcon}</span>}
        <input
          {...rest}
          id={inputId}
          aria-invalid={error ? true : rest['aria-invalid']}
          aria-describedby={describedBy}
          className="lg-field-input"
        />
        {trailingAction && <span className="lg-field-action">{trailingAction}</span>}
      </span>
      {(error || hint) && (
        <span id={descriptionId} className={cx('lg-field-message', error && 'lg-field-message-error')}>
          {error ?? hint}
        </span>
      )}
    </div>
  )
}
