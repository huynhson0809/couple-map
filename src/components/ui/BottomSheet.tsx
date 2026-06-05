import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export function BottomSheet({ open, onClose, title, children }: Props) {
  if (!open) return null
  return (
    <div className="sheet-backdrop lg-overlay-backdrop" onClick={onClose}>
      <div className="sheet lg-sheet" onClick={(e) => e.stopPropagation()}>
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
