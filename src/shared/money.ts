/** "12,50" | "1.234,56" | "R$ 9,9" | "12.5" → cents; "" → null; invalid → NaN. */
export function parseMoneyToCents(input: string): number | null {
  let s = input.replace(/R\$|\s/gi, '').trim()
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN
  return Math.round(parseFloat(s) * 100)
}

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

export function parseQuantity(s: string): number {
  const t = s.trim().replace(',', '.')
  if (!t) return 1
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

/** "Café 2" → { name: 'Café', quantity: 2 }. A trailing number (comma decimal allowed) is the quantity. */
export function parseQuickAdd(text: string): { name: string; quantity: number } {
  const clean = text.trim().replace(/\s+/g, ' ')
  const m = clean.match(/^(.*\S)\s+(\d+(?:[.,]\d+)?)$/)
  if (m) return { name: m[1], quantity: parseQuantity(m[2]) }
  return { name: clean, quantity: 1 }
}
