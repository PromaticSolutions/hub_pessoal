import type { Priority } from '@shared/types'
import { parseQuickAdd } from '@shared/money'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { camel, camelAll, insertId, must, requireName } from '../lib/rows'

const PRIO = "CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END"

export type ShoppingItem = {
  id: number
  name: string
  notes: string
  quantity: number
  unit: string
  category: string
  priceCents: number | null
  url: string | null
  priority: Priority
  status: 'pending' | 'bought'
  boughtAt: string | null
  position: number
  createdAt: string
  updatedAt: string
}
export type ShoppingInput = Partial<{ notes: string; quantity: number; unit: string; category: string; priceCents: number | null; url: string | null; priority: Priority }>

async function get(ctx: AppContext, id: number): Promise<ShoppingItem> {
  return camel<ShoppingItem>(must(await ctx.db.one('SELECT * FROM shopping_items WHERE id = ?', [id]), 'Item'))
}

function check(p: ShoppingInput) {
  if (p.quantity !== undefined && !(p.quantity > 0)) throw new AppError('VALIDATION', 'A quantidade precisa ser maior que zero.')
  if (p.priceCents != null && (!Number.isFinite(p.priceCents) || p.priceCents < 0)) throw new AppError('VALIDATION', 'Preço inválido.')
  if (p.url && !/^https?:\/\//i.test(p.url)) throw new AppError('VALIDATION', 'O link precisa começar com http:// ou https://')
}

export async function listShopping(ctx: AppContext, f: { status?: 'pending' | 'bought' | 'all'; category?: string }): Promise<ShoppingItem[]> {
  const status = f.status ?? 'pending'
  const w: string[] = []
  const p: unknown[] = []
  if (status !== 'all') { w.push('status = ?'); p.push(status) }
  if (f.category) { w.push('category = ?'); p.push(f.category) }
  const order = status === 'bought' ? 'bought_at DESC NULLS LAST, id DESC' : `status, ${PRIO}, position, id`
  return camelAll<ShoppingItem>(await ctx.db.many(`SELECT * FROM shopping_items ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY ${order}`, p))
}

export async function listShoppingCategories(ctx: AppContext): Promise<string[]> {
  return (
    await ctx.db.many<{ category: string }>("SELECT DISTINCT category, lower(category) FROM shopping_items WHERE category <> '' ORDER BY lower(category)")
  ).map((r) => r.category)
}

export async function shoppingTotals(ctx: AppContext) {
  // Current local month as UTC ISO bounds (bought_at is UTC ISO text).
  const now = ctx.now()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
  const rows = await ctx.db.many<{ category: string; pending_cents: number; bought_cents: number; no_price: number }>(
    `SELECT category,
         coalesce(sum(CASE WHEN status = 'pending' AND price_cents IS NOT NULL THEN round((price_cents * quantity)::numeric) END), 0) AS pending_cents,
         coalesce(sum(CASE WHEN status = 'bought' AND bought_at >= ? AND bought_at < ? AND price_cents IS NOT NULL THEN round((price_cents * quantity)::numeric) END), 0) AS bought_cents,
         count(*) FILTER (WHERE status = 'pending' AND price_cents IS NULL) AS no_price
       FROM shopping_items GROUP BY category ORDER BY lower(category)`,
    [monthStart, nextMonth]
  )
  return {
    pendingCents: rows.reduce((n, r) => n + r.pending_cents, 0),
    pendingWithoutPrice: rows.reduce((n, r) => n + r.no_price, 0),
    boughtThisMonthCents: rows.reduce((n, r) => n + r.bought_cents, 0),
    byCategory: rows.map((r) => ({ category: r.category || 'Sem categoria', pendingCents: r.pending_cents, boughtMonthCents: r.bought_cents }))
  }
}

export async function createShoppingItem(ctx: AppContext, input: { name: string } & ShoppingInput): Promise<ShoppingItem> {
  const name = requireName(input.name, 'Nome do produto')
  check(input)
  const id = await insertId(
    ctx.db,
    `INSERT INTO shopping_items(name, notes, quantity, unit, category, price_cents, url, priority, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT coalesce(max(position), 0) + 1024 FROM shopping_items))`,
    [name, input.notes ?? '', input.quantity ?? 1, input.unit ?? '', input.category?.trim() ?? '', input.priceCents ?? null, input.url || null, input.priority ?? 'medium']
  )
  return get(ctx, id)
}

export async function quickAddShopping(ctx: AppContext, text: string): Promise<ShoppingItem> {
  const q = parseQuickAdd(text)
  return createShoppingItem(ctx, { name: q.name, quantity: Number.isFinite(q.quantity) && q.quantity > 0 ? q.quantity : 1 })
}

export async function updateShoppingItem(ctx: AppContext, id: number, patch: { name?: string } & ShoppingInput): Promise<ShoppingItem> {
  const cur = await get(ctx, id)
  check(patch)
  const n = {
    name: patch.name !== undefined ? requireName(patch.name, 'Nome do produto') : cur.name,
    notes: patch.notes ?? cur.notes,
    quantity: patch.quantity ?? cur.quantity,
    unit: patch.unit ?? cur.unit,
    category: patch.category !== undefined ? patch.category.trim() : cur.category,
    priceCents: patch.priceCents !== undefined ? patch.priceCents : cur.priceCents,
    url: patch.url !== undefined ? patch.url || null : cur.url,
    priority: patch.priority ?? cur.priority
  }
  await ctx.db.run('UPDATE shopping_items SET name=?, notes=?, quantity=?, unit=?, category=?, price_cents=?, url=?, priority=?, updated_at=iso_now() WHERE id=?', [
    n.name, n.notes, n.quantity, n.unit, n.category, n.priceCents, n.url, n.priority, id
  ])
  return get(ctx, id)
}

export async function setBought(ctx: AppContext, id: number, bought: boolean): Promise<ShoppingItem> {
  await get(ctx, id)
  await ctx.db.run('UPDATE shopping_items SET status = ?, bought_at = ?, updated_at = iso_now() WHERE id = ?', [
    bought ? 'bought' : 'pending',
    bought ? ctx.now().toISOString() : null,
    id
  ])
  return get(ctx, id)
}

export async function deleteShoppingItem(ctx: AppContext, id: number): Promise<void> {
  await get(ctx, id)
  await ctx.db.run('DELETE FROM shopping_items WHERE id = ?', [id])
}
