import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from 'react'
import { X } from 'lucide-react'
import type { Priority } from '@shared/types'
import { PRIORITY_COLORS, PRIORITY_LABELS, SPACE_COLORS } from '@shared/constants'
import { cx } from '../lib/format'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md' }

export function Button({ variant = 'secondary', size = 'md', className, ...p }: BtnProps) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
        variant === 'primary' && 'bg-indigo-600 text-white hover:bg-indigo-500',
        variant === 'secondary' && 'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-500',
        variant === 'ghost' && 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
        className
      )}
    />
  )
}

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={cx(
        'h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900',
        className
      )}
    />
  )
}

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...p}
      className={cx(
        'w-full rounded-md border border-zinc-300 bg-white p-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900',
        className
      )}
    />
  )
}

export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...p}
      className={cx(
        'h-8 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900',
        className
      )}
    />
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
      {label}
      <div className="text-sm font-normal text-zinc-900 dark:text-zinc-100">{children}</div>
    </label>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
  testId
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  width?: string
  testId?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div data-testid={testId} className={cx('w-full rounded-lg bg-white shadow-xl dark:bg-zinc-900', width)}>
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="font-semibold">{title}</div>
            <button className="rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={onClose} aria-label="Fechar">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

/* ---------- Confirm (imperative) ---------- */

type ConfirmOpts = { title: string; description?: ReactNode; confirmLabel?: string; danger?: boolean; requireText?: string }
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const [typed, setTyped] = useState('')
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => { setTyped(''); setState({ ...o, resolve }) }), [])
  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  const canConfirm = !state?.requireText || typed.trim() === state.requireText.trim()
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title} testId="confirm-dialog">
        <div className="space-y-3 text-sm">
          {state?.description && <div className="text-zinc-600 dark:text-zinc-300">{state.description}</div>}
          {state?.requireText && (
            <Field label={`Digite "${state.requireText}" para confirmar`}>
              <Input data-testid="confirm-text" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            </Field>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => close(false)}>Cancelar</Button>
            <Button data-testid="confirm-ok" variant={state?.danger ? 'danger' : 'primary'} disabled={!canConfirm} onClick={() => close(true)}>
              {state?.confirmLabel ?? 'Confirmar'}
            </Button>
          </div>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  )
}

export const useConfirm = () => useContext(ConfirmCtx)

/* ---------- Prompt (imperative text input) ---------- */

type PromptOpts = { title: string; label?: string; initial?: string; confirmLabel?: string }
const PromptCtx = createContext<(o: PromptOpts) => Promise<string | null>>(async () => null)

export function PromptProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(PromptOpts & { resolve: (v: string | null) => void }) | null>(null)
  const [val, setVal] = useState('')
  const prompt = useCallback((o: PromptOpts) => new Promise<string | null>((resolve) => { setVal(o.initial ?? ''); setState({ ...o, resolve }) }), [])
  const close = (v: string | null) => {
    state?.resolve(v)
    setState(null)
  }
  return (
    <PromptCtx.Provider value={prompt}>
      {children}
      <Modal open={!!state} onClose={() => close(null)} title={state?.title} testId="prompt-dialog">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (val.trim()) close(val.trim())
          }}
        >
          <Field label={state?.label ?? 'Nome'}>
            <Input data-testid="prompt-input" value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => close(null)}>Cancelar</Button>
            <Button data-testid="prompt-ok" type="submit" variant="primary" disabled={!val.trim()}>
              {state?.confirmLabel ?? 'Salvar'}
            </Button>
          </div>
        </form>
      </Modal>
    </PromptCtx.Provider>
  )
}

export const usePrompt = () => useContext(PromptCtx)

/* ---------- Dropdown menu ---------- */

export type MenuItem = { label: string; onClick: () => void; danger?: boolean; testId?: string } | 'separator'

export function Menu({ trigger, items, align = 'right' }: { trigger: ReactNode; items: MenuItem[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div className="relative inline-block" ref={ref}>
      <div onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}>{trigger}</div>
      {open && (
        <div
          className={cx(
            'absolute z-40 mt-1 min-w-44 rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {items.map((it, i) =>
            it === 'separator' ? (
              <div key={i} className="my-1 border-t border-zinc-200 dark:border-zinc-700" />
            ) : (
              <button
                key={i}
                data-testid={it.testId}
                className={cx('block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800', it.danger && 'text-red-600')}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  it.onClick()
                }}
              >
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

/* ---------- Small visual pieces ---------- */

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SPACE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onChange(c)}
          className={cx('h-6 w-6 rounded-full border-2', value.toLowerCase() === c.toLowerCase() ? 'border-zinc-900 dark:border-white' : 'border-transparent')}
          style={{ background: c }}
        />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-6 w-8 cursor-pointer bg-transparent" />
    </div>
  )
}

export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ background: color, width: size, height: size }} />
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white" style={{ background: PRIORITY_COLORS[priority] }}>
      {PRIORITY_LABELS[priority]}
    </span>
  )
}

export function PageHeader({ title, children, testId = 'page-title' }: { title: ReactNode; children?: ReactNode; testId?: string }) {
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
      <h1 data-testid={testId} className="flex items-center gap-2 text-lg font-semibold">
        {title}
      </h1>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

export function EmptyState({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-sm text-zinc-500">
      <div>{text}</div>
      {children}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string }[] }) {
  return (
    <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
      {tabs.map((t) => (
        <button
          key={t.value}
          data-testid={`tab-${t.value}`}
          onClick={() => onChange(t.value)}
          className={cx(
            '-mb-px border-b-2 px-3 py-2 text-sm',
            value === t.value ? 'border-indigo-600 font-medium text-indigo-600' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
