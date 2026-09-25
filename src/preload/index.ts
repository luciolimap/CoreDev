import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS, type AppInfo } from '../shared/ipc'

/**
 * Ponte mínima. Sem lógica de negócio aqui — só tipagem e
 * invoke embrulhado. Ver ROADMAP.md §3.2 ("regra de ouro").
 */
const hub = {
  app: {
    getInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_INFO)
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
