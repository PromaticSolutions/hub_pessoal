import initial from './001_initial.sql?raw'
import folderArchive from './002_folder_archive.sql?raw'
import colors from './003_colors.sql?raw'
import dayBlocks from './004_day_blocks.sql?raw'
import ideas from './005_ideas.sql?raw'
import shopping from './006_shopping.sql?raw'

import type Database from 'better-sqlite3'
import dashboardsSql from './007_dashboards.sql?raw'
import { TEMPLATES, scopeFromV1 } from '@shared/widgets'

export type Migration = { version: number; name: string; sql: string; run?: (db: Database.Database) => void }

/** Seeds the "Geral" dashboard reproducing the v1 dashboard, keeping the scope chosen in v1. */
function seedDashboards(db: Database.Database) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'dashboard.scope'").get() as { value: string } | undefined
  let v1: unknown = undefined
  try { v1 = row ? JSON.parse(row.value) : undefined } catch { /* ignore */ }
  const t = TEMPLATES.geral
  const id = db.prepare('INSERT INTO dashboards(name, scope, position) VALUES (?, ?, 1024)').run(t.name, JSON.stringify(scopeFromV1(v1))).lastInsertRowid
  const ins = db.prepare('INSERT INTO dashboard_widgets(dashboard_id, type, title, config, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  for (const w of t.widgets) ins.run(id, w.type, w.title, JSON.stringify(w.config), w.x, w.y, w.w, w.h)
}

export const migrations: Migration[] = [
  { version: 1, name: 'initial', sql: initial },
  { version: 2, name: 'folder_archive', sql: folderArchive },
  { version: 3, name: 'colors', sql: colors },
  { version: 4, name: 'day_blocks', sql: dayBlocks },
  { version: 5, name: 'ideas', sql: ideas },
  { version: 6, name: 'shopping', sql: shopping },
  { version: 7, name: 'dashboards', sql: dashboardsSql, run: seedDashboards }
]
