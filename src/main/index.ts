import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { copyFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { ensureDataDirs, getDataRoot, resolveDataPaths, type DataPaths } from './paths'
import { openDatabase } from './db/connection'
import { runMigrations } from './db/migrate'
import { fileStamp } from './db/sqlutil'
import { closeDatabase, listAutoBackups, purgeDeletedAttachments, quickCheck, runDailyAutoBackup } from './services/maintenance'
import type { AppContext } from './context'
import { restoreMissingAttachments } from './services/attachments'
import { dispatch, logError } from './ipc/registry'
import { handlers } from './ipc/handlers'
import { setMainHooks } from './mainHooks'

let mainWindow: BrowserWindow | null = null
let ctx: AppContext | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Personal Task Hub',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.once('ready-to-show', () => win.show())
  win.on('page-title-updated', (e) => e.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

function moveDbFilesAside(paths: DataPaths, label: string): string {
  const dest = join(paths.backupsPreRestore, `${label}-${fileStamp()}`)
  mkdirSync(dest, { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    const f = paths.dbFile + suffix
    if (existsSync(f)) renameSync(f, join(dest, `hub.db${suffix}`))
  }
  return dest
}

/** Opens the database, recovering from corruption if the user agrees. Returns null to quit. */
function openCheckedDatabase(paths: DataPaths): Database.Database | null {
  let db: Database.Database | null = null
  try {
    db = openDatabase(paths.dbFile)
  } catch {
    db = null
  }
  if (db && quickCheck(db)) return db
  try {
    db?.close()
  } catch {
    /* ignore */
  }
  const backups = listAutoBackups(paths)
  const choice = dialog.showMessageBoxSync({
    type: 'error',
    title: 'Personal Task Hub',
    message: 'O banco de dados parece danificado.',
    detail: backups.length
      ? `Posso restaurar o backup automático mais recente (${backups[0].date}). O arquivo atual será guardado em backups/pre-restore.`
      : 'Não há backups automáticos disponíveis. O arquivo atual não será alterado.',
    buttons: backups.length ? ['Restaurar último backup automático', 'Sair'] : ['Sair'],
    defaultId: 0,
    cancelId: backups.length ? 1 : 0
  })
  if (!backups.length || choice !== 0) return null
  moveDbFilesAside(paths, 'corrupted')
  copyFileSync(backups[0].file, paths.dbFile)
  const restored = openDatabase(paths.dbFile)
  return quickCheck(restored) ? restored : null
}

function boot(): void {
  const paths = resolveDataPaths(getDataRoot(app.isPackaged))
  ensureDataDirs(paths)
  const db = openCheckedDatabase(paths)
  if (!db) {
    app.exit(1)
    return
  }
  try {
    runMigrations(db, { preMigrationDir: paths.backupsPreMigration })
  } catch (err) {
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'Personal Task Hub',
      message: 'Não foi possível preparar o banco de dados.',
      detail: err instanceof Error ? err.message : String(err)
    })
    db.close()
    app.exit(1)
    return
  }
  ctx = { db, paths, now: () => new Date() }
  try {
    runDailyAutoBackup(db, paths, new Date())
    restoreMissingAttachments(paths, db)
    purgeDeletedAttachments(paths, new Date())
  } catch (err) {
    logError(ctx, 'startup-maintenance', err)
  }
  const c = ctx
  ipcMain.handle('api', (_e, method: string, input: unknown) => dispatch(handlers, c, method, input))
  setMainHooks({
    getWindow: () => mainWindow,
    getContext: () => ctx
  })
  mainWindow = createWindow()
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0)
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    boot()
  })

  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => {
    if (ctx) closeDatabase(ctx.db)
  })
}
