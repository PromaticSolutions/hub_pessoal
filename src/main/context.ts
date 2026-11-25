import type Database from 'better-sqlite3'
import type { DataPaths } from './paths'

export type AppContext = { db: Database.Database; paths: DataPaths; now: () => Date }
