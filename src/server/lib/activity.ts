import type { Db } from '../db/db'

export type ActivityInput = {
  entityType: 'task' | 'project' | 'company' | 'board' | 'folder'
  entityId: number
  taskId?: number | null
  action: string
  field?: string
  oldValue?: unknown
  newValue?: unknown
  at?: string
}

const ser = (v: unknown): string | null =>
  v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v)

export async function logActivity(db: Db, e: ActivityInput): Promise<void> {
  await db.run(
    `INSERT INTO activity_log(entity_type, entity_id, task_id, action, field, old_value, new_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, coalesce(?, iso_now()))`,
    [e.entityType, e.entityId, e.taskId ?? null, e.action, e.field ?? null, ser(e.oldValue), ser(e.newValue), e.at ?? null]
  )
}
