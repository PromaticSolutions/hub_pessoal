const p2 = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' in local time */
export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

/** 'YYYY-MM-DDTHH:mm' in local time */
export function toLocalMinute(d: Date): string {
  return `${toLocalDate(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`
}
