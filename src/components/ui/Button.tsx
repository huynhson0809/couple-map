import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

const styles: Record<Variant, string> = {
  primary: 'bg-coral text-white',
  secondary: 'bg-slate-200 text-slate-900',
  ghost: 'bg-transparent text-slate-700',
  danger: 'bg-red-600 text-white',
}

export function Button({ variant = 'primary', className = '', ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`btn ${styles[variant]} ${className}`}
    />
  )
}
