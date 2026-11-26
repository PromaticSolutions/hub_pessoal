import type { Db } from './db/db'
import type { Storage } from './storage/storage'

export type AppContext = { db: Db; storage: Storage; now: () => Date }
