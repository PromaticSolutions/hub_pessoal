import type { ApiMethods } from '@shared/api'

type Item = ApiMethods['attachments.list']['output'][number]

/** Where an attachment lives: route to open it and a human label. */
export function attachmentOrigin(a: Item): { href: string; label: string; color: string } {
  if (a.ideaId != null) return { href: `/ideas?idea=${a.ideaId}`, label: `Ideia: ${a.ideaTitle ?? ''}`, color: '#EAB308' }
  const href = a.taskId ? `/projects/${a.projectId}?task=${a.taskId}` : `/projects/${a.projectId}`
  const label = `${a.taskTitle ? `${a.taskTitle} › ` : ''}${a.projectName ?? ''} › ${a.companyName ?? ''}`
  return { href, label, color: a.companyColor ?? '#94A3B8' }
}
