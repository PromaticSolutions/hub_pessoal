import initial from './001_initial.sql?raw'

export type Migration = { version: number; name: string; sql: string }

export const migrations: Migration[] = [{ version: 1, name: 'initial', sql: initial }]
