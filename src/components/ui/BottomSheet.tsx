import { useEffect, useRef } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export function BottomSheet({ open, onClose, title, children }: Props) {
  const backdropPointerIdRef = useRef<number | null>(null)
  const clickGuardCleanupRef = useRef<(() => void) | null>(null)

  function clearBackdropClickGuard() {
    clickGuardCleanupRef.current?.()
    clickGuardCleanupRef.current = null
  }

  function installBackdropClickGuard() {
    clearBackdropClickGuard()

    const guardedEvents = [
      'mouseup',
      'click',
      'touchend',
      'pointerup',
    ]
    const guardListenerOptions = { capture: true, passive: false }
    const fallbackTimer = window.setTimeout(clearBackdropClickGuard, 180)
    const stopBackdropClickThrough = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      clearBackdropClickGuard()
    }

    document.documentElement.classList.add('bottom-sheet-click-guard')
    document.addEventListener('click', stopBackdropClickThrough, true)
    guardedEvents.forEach((eventName) => {
      document.addEventListener(eventName, stopBackdropClickThrough, guardListenerOptions)
    })
    clickGuardCleanupRef.current = () => {
      guardedEvents.forEach((eventName) => {
        document.removeEventListener(eventName, stopBackdropClickThrough, guardListenerOptions)
      })
      document.documentElement.classList.remove('bottom-sheet-click-guard')
      window.clearTimeout(fallbackTimer)
    }
  }

  useEffect(() => () => clearBackdropClickGuard(), [])

  function handleBackdropPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    event.stopPropagation()
    backdropPointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleBackdropPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (backdropPointerIdRef.current !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    backdropPointerIdRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    installBackdropClickGuard()
    onClose()
  }

  function handleBackdropPointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (backdropPointerIdRef.current !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    backdropPointerIdRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  if (!open) return null
  return (
    <div
      className="sheet-backdrop lg-overlay-backdrop"
      onPointerDown={handleBackdropPointerDown}
      onPointerUp={handleBackdropPointerUp}
      onPointerCancel={handleBackdropPointerCancel}
    >
      <div
        className="sheet lg-sheet"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle lg-sheet-handle" />
        <div className="sheet-header lg-sheet-header">
          <h3>{title}</h3>
          <IconButton label="Close" size="sm" variant="ghost" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        <div className="sheet-body lg-sheet-body">{children}</div>
      </div>
    </div>
  )
}
