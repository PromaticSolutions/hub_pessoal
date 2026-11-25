import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { ensureDataDirs, getDataRoot, resolveDataPaths, type DataPaths } from './paths'
import { openDatabase } from './db/connection'
import { runMigrations } from './db/migrate'
import { closeDatabase, listAutoBackups, purgeDeletedAttachments, quickCheck, recoverFromAutoBackups, runDailyAutoBackup } from './services/maintenance'
import type { AppContext } from './context'
import { restoreMissingAttachments } from './services/attachments'
import { applyRestore } from './services/backup'
import { dispatch, logError } from './ipc/registry'
import { handlers } from './ipc/handlers'
import { setMainHooks } from './mainHooks'

let mainWindow: BrowserWindow | null = null
let ctx: AppContext | null = null

function appUrl(): string {
  return process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(join(__dirname, '../renderer/index.html')).href
}

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
  // Never leave the app page: block navigations and new windows (http(s) links open in the browser).
  win.webContents.on('will-navigate', (e, url) => {
    if (url.split('#')[0] !== appUrl()) e.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  // Ask the renderer to save pending edits before the window goes away.
  let flushed = false
  win.on('close', (e) => {
    if (flushed || win.webContents.isDestroyed()) return
    e.preventDefault()
    flushed = true
    const done = () => { clearTimeout(timer); if (!win.isDestroyed()) win.close() }
    const timer = setTimeout(done, 3000)
    ipcMain.once('app:flushed', done)
    win.webContents.send('app:flush')
  })
  win.on('page-title-updated', (e) => e.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
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
      ? `Posso restaurar o backup automático íntegro mais recente (a partir de ${backups[0].date}). O arquivo atual será guardado em backups/pre-restore.`
      : 'Não há backups automáticos disponíveis. O arquivo atual não será alterado.',
    buttons: backups.length ? ['Restaurar último backup automático', 'Sair'] : ['Sair'],
    defaultId: 0,
    cancelId: backups.length ? 1 : 0
  })
  if (!backups.length || choice !== 0) return null
  const restored = recoverFromAutoBackups(paths)
  if (!restored) dialog.showMessageBoxSync({ type: 'error', title: 'Personal Task Hub', message: 'Nenhum backup automático íntegro foi encontrado.', detail: 'O arquivo danificado foi guardado em backups/pre-restore. Use Configurações → Restaurar backup com um backup completo.' })
  return restored
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
  ipcMain.handle('api', (e, method: string, input: unknown) => {
    const from = e.senderFrame?.url?.split('#')[0] ?? ''
    if (!from.startsWith(appUrl())) return { ok: false, error: { code: 'FORBIDDEN', message: 'Origem não autorizada.' } }
    return dispatch(handlers, c, method, input)
  })
  setMainHooks({
    getWindow: () => mainWindow,
    getContext: () => ctx,
    requestRestore: (stagingDir) => {
      try {
        mainWindow?.destroy()
        if (ctx) closeDatabase(ctx.db)
        ctx = null
        applyRestore(paths, stagingDir, new Date())
      } catch (err) {
        dialog.showMessageBoxSync({ type: 'error', title: 'Personal Task Hub', message: 'Falha ao restaurar o backup.', detail: err instanceof Error ? err.message : String(err) })
      }
      if (!process.env.PTH_NO_RELAUNCH) app.relaunch()
      app.exit(0)
    }
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
