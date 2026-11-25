import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type Toast = { id: number; kind: 'error' | 'success'; text: string }
type Ctx = { error(t: string): void; success(t: string): void }
const ToastCtx = createContext<Ctx>({ error: () => {}, success: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random()
    setItems((s) => [...s, { id, kind, text }])
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 5000)
  }, [])
  const value = useMemo(() => ({ error: (t: string) => push('error', t), success: (t: string) => push('success', t) }), [push])
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            data-testid={`toast-${t.kind}`}
            className={`max-w-sm rounded-md px-4 py-2 text-sm text-white shadow ${t.kind === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
