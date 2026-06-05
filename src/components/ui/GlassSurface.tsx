import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'
import { cx } from './uiClasses'

type SurfaceLevel = 'shell' | 'section' | 'control'

type Props<T extends ElementType> = {
  as?: T
  level?: SurfaceLevel
  interactive?: boolean
  className?: string
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>

export function GlassSurface<T extends ElementType = 'div'>({
  as,
  level = 'section',
  interactive = false,
  className = '',
  children,
  ...rest
}: Props<T>) {
  const Component = (as ?? 'div') as ElementType

  return (
    <Component
      {...rest}
      className={cx(
        'lg-surface',
        `lg-surface-${level}`,
        interactive && 'lg-surface-interactive',
        className,
      )}
    >
      {children}
    </Component>
  )
}
