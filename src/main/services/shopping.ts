import type { Priority } from '@shared/types'
import { parseQuickAdd } from '@shared/money'
import { toLocalDate } from '@shared/dates'
import type { AppContext } from '../context'
import { AppError } from '../lib/errors'
import { camel, camelAll, must, requireName } from '../lib/rows'

const TS = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
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

function get(ctx: AppContext, id: number): ShoppingItem {
  return camel<ShoppingItem>(must(ctx.db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(id) as Record<string, unknown>, 'Item'))
}

function check(p: ShoppingInput) {
  if (p.quantity !== undefined && !(p.quantity > 0)) throw new AppError('VALIDATION', 'A quantidade precisa ser maior que zero.')
  if (p.priceCents != null && (!Number.isFinite(p.priceCents) || p.priceCents < 0)) throw new AppError('VALIDATION', 'Preço inválido.')
  if (p.url && !/^https?:\/\//i.test(p.url)) throw new AppError('VALIDATION', 'O link precisa começar com http:// ou https://')
}

export function listShopping(ctx: AppContext, f: { status?: 'pending' | 'bought' | 'all'; category?: string }): ShoppingItem[] {
  const status = f.status ?? 'pending'
  const w: string[] = []
  const p: unknown[] = []
  if (status !== 'all') { w.push('status = ?'); p.push(status) }
  if (f.category) { w.push('category = ?'); p.push(f.category) }
  const order = status === 'bought' ? 'bought_at DESC, id DESC' : `status, ${PRIO}, position, id`
  return camelAll<ShoppingItem>(ctx.db.prepare(`SELECT * FROM shopping_items ${w.length ? `WHERE ${w.join(' AND ')}` : ''} ORDER BY ${order}`).all(...p))
}

export function listShoppingCategories(ctx: AppContext): string[] {
  return (ctx.db.prepare("SELECT DISTINCT category FROM shopping_items WHERE category <> '' ORDER BY lower(category)").all() as { category: string }[]).map((r) => r.category)
}

export function shoppingTotals(ctx: AppContext) {
  const month = toLocalDate(ctx.now()).slice(0, 7)
  const rows = ctx.db
    .prepare(
      `SELECT category,
         coalesce(sum(CASE WHEN status = 'pending' AND price_cents IS NOT NULL THEN round(price_cents * quantity) END), 0) AS pending_cents,
         coalesce(sum(CASE WHEN status = 'bought' AND substr(datetime(bought_at, 'localtime'), 1, 7) = ? AND price_cents IS NOT NULL THEN round(price_cents * quantity) END), 0) AS bought_cents,
         sum(status = 'pending' AND price_cents IS NULL) AS no_price
       FROM shopping_items GROUP BY category ORDER BY lower(category)`
    )
    .all(month) as { category: string; pending_cents: number; bought_cents: number; no_price: number }[]
  return {
    pendingCents: rows.reduce((n, r) => n + r.pending_cents, 0),
    pendingWithoutPrice: rows.reduce((n, r) => n + r.no_price, 0),
    boughtThisMonthCents: rows.reduce((n, r) => n + r.bought_cents, 0),
    byCategory: rows.map((r) => ({ category: r.category || 'Sem categoria', pendingCents: r.pending_cents, boughtMonthCents: r.bought_cents }))
  }
}

export function createShoppingItem(ctx: AppContext, input: { name: string } & ShoppingInput): ShoppingItem {
  const name = requireName(input.name, 'Nome do produto')
  check(input)
  const id = ctx.db
    .prepare(
      `INSERT INTO shopping_items(name, notes, quantity, unit, category, price_cents, url, priority, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT coalesce(max(position), 0) + 1024 FROM shopping_items))`
    )
    .run(name, input.notes ?? '', input.quantity ?? 1, input.unit ?? '', input.category?.trim() ?? '', input.priceCents ?? null, input.url || null, input.priority ?? 'medium')
    .lastInsertRowid as number
  return get(ctx, id)
}

export function quickAddShopping(ctx: AppContext, text: string): ShoppingItem {
  const q = parseQuickAdd(text)
  return createShoppingItem(ctx, { name: q.name, quantity: Number.isFinite(q.quantity) && q.quantity > 0 ? q.quantity : 1 })
}

export function updateShoppingItem(ctx: AppContext, id: number, patch: { name?: string } & ShoppingInput): ShoppingItem {
  const cur = get(ctx, id)
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
  ctx.db
    .prepare(`UPDATE shopping_items SET name=?, notes=?, quantity=?, unit=?, category=?, price_cents=?, url=?, priority=?, updated_at=${TS} WHERE id=?`)
    .run(n.name, n.notes, n.quantity, n.unit, n.category, n.priceCents, n.url, n.priority, id)
  return get(ctx, id)
}

export function setBought(ctx: AppContext, id: number, bought: boolean): ShoppingItem {
  get(ctx, id)
  ctx.db
    .prepare(`UPDATE shopping_items SET status = ?, bought_at = ?, updated_at = ${TS} WHERE id = ?`)
    .run(bought ? 'bought' : 'pending', bought ? ctx.now().toISOString() : null, id)
  return get(ctx, id)
}

export function deleteShoppingItem(ctx: AppContext, id: number): void {
  get(ctx, id)
  ctx.db.prepare('DELETE FROM shopping_items WHERE id = ?').run(id)
}
