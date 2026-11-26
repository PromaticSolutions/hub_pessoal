import initial from './001_initial.sql?raw'
import folderArchive from './002_folder_archive.sql?raw'
import colors from './003_colors.sql?raw'
import dayBlocks from './004_day_blocks.sql?raw'
import ideas from './005_ideas.sql?raw'

export type Migration = { version: number; name: string; sql: string }

export const migrations: Migration[] = [
  { version: 1, name: 'initial', sql: initial },
  { version: 2, name: 'folder_archive', sql: folderArchive },
  { version: 3, name: 'colors', sql: colors },
  { version: 4, name: 'day_blocks', sql: dayBlocks },
  { version: 5, name: 'ideas', sql: ideas }
]
