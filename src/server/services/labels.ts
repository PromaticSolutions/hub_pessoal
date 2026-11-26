import type { Label } from '@shared/types'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { camelAll, must, requireName } from '../lib/rows'

export function listLabels(ctx: AppContext): (Label & { usage: number })[] {
  return camelAll<Label & { usage: number }>(
    ctx.db.prepare('SELECT l.*, (SELECT count(*) FROM task_labels tl WHERE tl.label_id = l.id) AS usage FROM labels l ORDER BY lower(l.name)').all()
  )
}

function getLabel(ctx: AppContext, id: number): Label {
  return must(ctx.db.prepare('SELECT * FROM labels WHERE id = ?').get(id) as Label | undefined, 'Etiqueta')
}

function assertUnique(ctx: AppContext, name: string, exceptId: number | null) {
  const dup = ctx.db.prepare('SELECT id FROM labels WHERE lower(name) = lower(?) AND id IS NOT ?').get(name, exceptId)
  if (dup) throw new AppError('CONFLICT', `Já existe uma etiqueta chamada "${name}".`)
}

export function createLabel(ctx: AppContext, input: { name: string; color: string }): Label {
  const name = requireName(input.name)
  assertUnique(ctx, name, null)
  const id = ctx.db.prepare('INSERT INTO labels(name, color) VALUES (?, ?)').run(name, input.color).lastInsertRowid as number
  return getLabel(ctx, id)
}

export function updateLabel(ctx: AppContext, id: number, patch: { name?: string; color?: string }): Label {
  const cur = getLabel(ctx, id)
  const name = patch.name !== undefined ? requireName(patch.name) : cur.name
  assertUnique(ctx, name, id)
  ctx.db.prepare('UPDATE labels SET name = ?, color = ? WHERE id = ?').run(name, patch.color ?? cur.color, id)
  return getLabel(ctx, id)
}

export function deleteLabel(ctx: AppContext, id: number): void {
  getLabel(ctx, id)
  ctx.db.prepare('DELETE FROM labels WHERE id = ?').run(id)
}
