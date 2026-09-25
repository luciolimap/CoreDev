import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '../shared/ipc'
import type {
  AppInfo,
  ClaudeBinaryStatus,
  ProjectInfo,
  PtySpawnRequest,
  PtySpawnResponse,
  PtyDataEvent,
  PtyExitEvent
} from '../shared/ipc'

/**
 * Ponte mínima. Sem lógica de negócio aqui — só tipagem e
 * invoke embrulhado. Ver ROADMAP.md §3.2 ("regra de ouro").
 */
const hub = {
  app: {
    getInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_INFO)
  },
  pty: {
    spawn: (req: PtySpawnRequest): Promise<PtySpawnResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.PTY_SPAWN, req),
    write: (ptyId: string, data: string): void => {
      ipcRenderer.send(IPC_CHANNELS.PTY_WRITE, { ptyId, data })
    },
    resize: (ptyId: string, cols: number, rows: number): void => {
      ipcRenderer.send(IPC_CHANNELS.PTY_RESIZE, { ptyId, cols, rows })
    },
    kill: (ptyId: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.PTY_KILL, { ptyId }),
    onData: (callback: (event: PtyDataEvent) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: PtyDataEvent): void =>
        callback(payload)
      ipcRenderer.on(IPC_CHANNELS.PTY_DATA, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PTY_DATA, listener)
    },
    onExit: (callback: (event: PtyExitEvent) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: PtyExitEvent): void =>
        callback(payload)
      ipcRenderer.on(IPC_CHANNELS.PTY_EXIT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PTY_EXIT, listener)
    }
  },
  project: {
    pickDirectory: (): Promise<ProjectInfo | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_PICK_DIRECTORY),
    getLast: (): Promise<ProjectInfo | null> => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_GET_LAST)
  },
  claude: {
    checkBinary: (): Promise<ClaudeBinaryStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_CHECK_BINARY)
  }
}

export type Hub = typeof hub

// contextIsolation é sempre true neste app (ROADMAP.md §3.2) — sem fallback.
try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('hub', hub)
} catch (error) {
  console.error(error)
}
