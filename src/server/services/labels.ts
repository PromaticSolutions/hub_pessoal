import type { Label } from '@shared/types'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { camelAll, insertId, must, requireName } from '../lib/rows'

export async function listLabels(ctx: AppContext): Promise<(Label & { usage: number })[]> {
  return camelAll<Label & { usage: number }>(
    await ctx.db.many('SELECT l.*, (SELECT count(*) FROM task_labels tl WHERE tl.label_id = l.id) AS usage FROM labels l ORDER BY lower(l.name)')
  )
}

async function getLabel(ctx: AppContext, id: number): Promise<Label> {
  return must(await ctx.db.one<Label>('SELECT * FROM labels WHERE id = ?', [id]), 'Etiqueta')
}

async function assertUnique(ctx: AppContext, name: string, exceptId: number | null) {
  const dup = await ctx.db.one('SELECT id FROM labels WHERE lower(name) = lower(?) AND id IS DISTINCT FROM ?', [name, exceptId])
  if (dup) throw new AppError('CONFLICT', `Já existe uma etiqueta chamada "${name}".`)
}

export async function createLabel(ctx: AppContext, input: { name: string; color: string }): Promise<Label> {
  const name = requireName(input.name)
  await assertUnique(ctx, name, null)
  const id = await insertId(ctx.db, 'INSERT INTO labels(name, color) VALUES (?, ?)', [name, input.color])
  return getLabel(ctx, id)
}

export async function updateLabel(ctx: AppContext, id: number, patch: { name?: string; color?: string }): Promise<Label> {
  const cur = await getLabel(ctx, id)
  const name = patch.name !== undefined ? requireName(patch.name) : cur.name
  await assertUnique(ctx, name, id)
  await ctx.db.run('UPDATE labels SET name = ?, color = ? WHERE id = ?', [name, patch.color ?? cur.color, id])
  return getLabel(ctx, id)
}

export async function deleteLabel(ctx: AppContext, id: number): Promise<void> {
  await getLabel(ctx, id)
  await ctx.db.run('DELETE FROM labels WHERE id = ?', [id])
}
