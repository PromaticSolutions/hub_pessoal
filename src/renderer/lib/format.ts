import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function formatDate(iso: string | null | undefined, withTime = true): string {
  if (!iso) return ''
  const d = parseISO(iso)
  const hasTime = iso.length > 10
  return format(d, hasTime && withTime ? "dd/MM/yyyy HH:mm" : 'dd/MM/yyyy', { locale: ptBR })
}

export function formatShort(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = parseISO(iso)
  return format(d, iso.length > 10 ? "dd MMM HH:mm" : 'dd MMM', { locale: ptBR })
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ')
}
