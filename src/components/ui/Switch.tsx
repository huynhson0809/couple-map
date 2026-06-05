import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cx } from './uiClasses'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode
}

export function Switch({ id, label, className = '', ...rest }: Props) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <label className={cx('lg-switch', className)} htmlFor={inputId}>
      {label && <span className="lg-switch-label">{label}</span>}
      <input {...rest} id={inputId} type="checkbox" className="lg-switch-input" />
      <span className="lg-switch-track" aria-hidden="true">
        <span className="lg-switch-thumb" />
      </span>
    </label>
  )
}
