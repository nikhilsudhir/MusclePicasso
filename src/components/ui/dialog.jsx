import * as React from 'react'
import { cn } from '../../lib/utils'

function Dialog({ open, onClose, children }) {
  React.useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className={cn(
          'relative w-full max-w-md mx-4 rounded-xl border border-border overflow-hidden',
          'shadow-2xl animate-in'
        )}
        style={{ background: '#0f0f17' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function DialogClose({ onClose }) {
  return (
    <button
      onClick={onClose}
      className="absolute top-3 right-3 w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors z-10 cursor-pointer"
      style={{ color: '#666', fontSize: 16 }}
    >
      ✕
    </button>
  )
}

export { Dialog, DialogClose }
