import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { IPC_CHANNELS, type AppInfo } from '../shared/ipc'
import type {
  PtySpawnRequest,
  PtySpawnResponse,
  PtyWriteMessage,
  PtyResizeMessage,
  PtyKillRequest
} from '../shared/ipc'
import { PtyManager } from './ptyManager'

let mainWindow: BrowserWindow | null = null
const ptyManager = new PtyManager(() => mainWindow?.webContents ?? null)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (is.dev) mainWindow?.webContents.openDevTools({ mode: 'detach' })
  })

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer crashed]', details)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.coredev.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle(IPC_CHANNELS.APP_GET_INFO, (): AppInfo => {
    return { version: app.getVersion(), platform: process.platform }
  })

  ipcMain.handle(IPC_CHANNELS.PTY_SPAWN, (_event, req: PtySpawnRequest): PtySpawnResponse => {
    return ptyManager.spawn(req)
  })

  ipcMain.on(IPC_CHANNELS.PTY_WRITE, (_event, msg: PtyWriteMessage) => {
    ptyManager.write(msg.ptyId, msg.data)
  })

  ipcMain.on(IPC_CHANNELS.PTY_RESIZE, (_event, msg: PtyResizeMessage) => {
    ptyManager.resize(msg.ptyId, msg.cols, msg.rows)
  })

  ipcMain.handle(IPC_CHANNELS.PTY_KILL, (_event, req: PtyKillRequest) => {
    ptyManager.kill(req.ptyId)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  ptyManager.killAll()
})
