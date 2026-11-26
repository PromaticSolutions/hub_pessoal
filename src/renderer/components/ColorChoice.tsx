import { Ban } from 'lucide-react'
import { SOFT_COLORS } from '@shared/constants'
import { cx } from '../lib/format'
import { Modal } from './ui'

/** Soft palette + custom color + "no color". */
export function ColorChoice({ value, onChange, testId }: { value: string | null; onChange: (c: string | null) => void; testId?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={testId}>
      <button
        type="button"
        aria-label="Sem cor"
        title="Sem cor"
        onClick={() => onChange(null)}
        className={cx('flex h-6 w-6 items-center justify-center rounded-[4px] border border-[var(--line-strong)] text-zinc-400', !value && 'ring-2 ring-indigo-500 ring-offset-1')}
      >
        <Ban size={12} />
      </button>
      {SOFT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Cor ${c}`}
          data-testid={testId ? `${testId}-${c.slice(1)}` : undefined}
          onClick={() => onChange(c)}
          className={cx('h-6 w-6 rounded-[4px] transition-transform hover:scale-110', value?.toLowerCase() === c.toLowerCase() && 'ring-2 ring-indigo-500 ring-offset-1')}
          style={{ background: c }}
        />
      ))}
      <label className="flex h-6 cursor-pointer items-center gap-1 rounded-[4px] border border-[var(--line-strong)] px-1.5 text-[11px] text-zinc-500" title="Cor personalizada">
        <input type="color" className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0" value={value ?? '#6366f1'} onChange={(e) => onChange(e.target.value)} />
        Outra
      </label>
    </div>
  )
}

export function ColorDialog({ open, title, value, onPick, onClose }: { open: boolean; title: string; value: string | null; onPick: (c: string | null) => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-sm" testId="color-dialog">
      <ColorChoice value={value} testId="color-choice" onChange={(c) => { onPick(c); onClose() }} />
    </Modal>
  )
}

/** Column/board background: the color blended softly into the lane color (works in light and dark). */
export const softBg = (color: string | null | undefined, pct = 8) => (color ? `color-mix(in srgb, ${color} ${pct}%, var(--lane))` : undefined)
