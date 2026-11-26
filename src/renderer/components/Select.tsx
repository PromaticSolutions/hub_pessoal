import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cx } from '../lib/format'
import { parseOptions } from './select-options'

type Props = {
  value?: string | number | null
  onChange?: (e: { target: { value: string } }) => void
  children?: ReactNode
  className?: string
  disabled?: boolean
  title?: string
  'aria-label'?: string
  'data-testid'?: string
}

type Pos = { top: number; left: number; minWidth: number; maxHeight: number }

/** Drop-in replacement for a native <select>: same <option>/<optgroup> children and onChange(e.target.value). */
export function Select({ value, onChange, children, className, disabled, title, 'aria-label': ariaLabel, 'data-testid': testId }: Props) {
  const items = useMemo(() => parseOptions(children), [children])
  const options = items.flatMap((it, i) => (it.kind === 'option' ? [{ ...it, index: i }] : []))
  const current = String(value ?? '')
  const selected = options.find((o) => o.value === current) ?? options[0]
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState<Pos | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const listId = useId()

  const place = () => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const wanted = Math.min(300, options.length * 32 + items.length * 2 + 12)
    const up = below < Math.min(wanted, 200) && above > below
    const maxHeight = Math.max(120, Math.min(300, up ? above : below))
    setPos({ top: up ? r.top - Math.min(wanted, maxHeight) - 4 : r.bottom + 4, left: r.left, minWidth: r.width, maxHeight })
  }

  const openList = () => {
    if (disabled) return
    place()
    setActive(Math.max(0, options.findIndex((o) => o.value === selected?.value)))
    setOpen(true)
  }
  const close = () => setOpen(false)
  const choose = (v: string) => {
    close()
    btn.current?.focus()
    if (v !== current) onChange?.({ target: { value: v } })
  }

  useLayoutEffect(() => {
    if (!open) return
    list.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!btn.current?.contains(t) && !list.current?.contains(t)) close()
    }
    const onScroll = (e: Event) => {
      if (list.current && e.target instanceof Node && list.current.contains(e.target)) return
      close()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const move = (dir: 1 | -1) => {
    let i = active
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length
      if (!options[i].disabled) break
    }
    setActive(i)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openList()
      }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return }
    if (e.key === 'Home') { e.preventDefault(); setActive(0); return }
    if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); return }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const o = options[active]
      if (o && !o.disabled) choose(o.value)
      return
    }
    if (e.key === 'Tab') { close(); return }
    if (e.key.length === 1) {
      const now = Date.now()
      typed.current.text = now - typed.current.at > 600 ? e.key.toLowerCase() : typed.current.text + e.key.toLowerCase()
      typed.current.at = now
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text))
      if (hit >= 0) setActive(hit)
    }
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        data-testid={testId}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={cx(
          'inline-flex h-8 min-w-0 items-center justify-between gap-2 rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 text-left text-sm shadow-[0_1px_2px_rgba(16,24,40,.04)] outline-none transition hover:border-zinc-300 focus-visible:border-indigo-500 focus-visible:ring-3 focus-visible:ring-indigo-500/15 disabled:opacity-50 dark:hover:border-zinc-600',
          open && 'border-indigo-500 ring-3 ring-indigo-500/15',
          className
        )}
      >
        <span className="truncate">{selected?.label ?? ''}</span>
        <ChevronDown size={14} className={cx('shrink-0 text-zinc-400 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={list}
            id={listId}
            role="listbox"
            className="glass pop-in fixed z-[200] overflow-y-auto rounded-md py-1 text-sm shadow-[var(--shadow-3)]"
            style={{ top: pos.top, left: pos.left, minWidth: pos.minWidth, maxHeight: pos.maxHeight, maxWidth: 420 }}
          >
            {items.map((it, i) => {
              if (it.kind === 'group') return <div key={`g${i}`} className="section-title px-3 pb-1 pt-2">{it.label}</div>
              const idx = options.findIndex((o) => o.index === i)
              const isSel = it.value === selected?.value
              return (
                <div
                  key={`o${i}`}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={it.disabled || undefined}
                  data-idx={idx}
                  data-testid={testId ? `${testId}-option-${it.value}` : undefined}
                  onMouseEnter={() => setActive(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => !it.disabled && choose(it.value)}
                  className={cx(
                    'mx-1 flex cursor-pointer items-center gap-2 rounded-[4px] px-2 py-1.5',
                    idx === active && 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
                    isSel && 'font-medium',
                    it.disabled && 'cursor-not-allowed opacity-40'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{it.label || ' '}</span>
                  {isSel && <Check size={14} className="shrink-0 text-indigo-600" aria-hidden="true" />}
                </div>
              )
            })}
          </div>,
          document.body
        )}
    </>
  )
}
