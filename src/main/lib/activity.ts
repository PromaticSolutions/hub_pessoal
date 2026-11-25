import type Database from 'better-sqlite3'

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

export function logActivity(db: Database.Database, e: ActivityInput): void {
  db.prepare(
    `INSERT INTO activity_log(entity_type, entity_id, task_id, action, field, old_value, new_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, coalesce(?, strftime('%Y-%m-%dT%H:%M:%fZ','now')))`
  ).run(e.entityType, e.entityId, e.taskId ?? null, e.action, e.field ?? null, ser(e.oldValue), ser(e.newValue), e.at ?? null)
}
