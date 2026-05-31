import { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

let toastListeners: ((toasts: Toast[]) => void)[] = []
let toasts: Toast[] = []

function notify() {
  toastListeners.forEach((listener) => listener([...toasts]))
}

export function addToast(message: string, type: ToastType = 'info', duration = 4000) {
  const id = `${Date.now()}-${Math.random()}`
  const toast: Toast = { id, message, type }
  toasts = [toast, ...toasts].slice(0, 5)
  notify()

  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    notify()
  }, duration)
}

export function useToasts() {
  const [state, setState] = useState<Toast[]>([])

  useEffect(() => {
    toastListeners.push(setState)
    setState([...toasts])
    return () => {
      toastListeners = toastListeners.filter((l) => l !== setState)
    }
  }, [])

  return state
}

const typeStyles: Record<ToastType, string> = {
  success: 'toast-success',
  error: 'toast-error',
  warning: 'toast-warning',
  info: 'toast-info',
}

const typeIcons: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
}

export function ToastContainer() {
  const toastsList = useToasts()

  if (toastsList.length === 0) return null

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      {toastsList.map((toast) => (
        <div key={toast.id} className={`toast-item ${typeStyles[toast.type]}`} role="alert">
          <span className="toast-icon">{typeIcons[toast.type]}</span>
          <span className="toast-message">{toast.message}</span>
        </div>
      ))}
    </div>
  )
}
