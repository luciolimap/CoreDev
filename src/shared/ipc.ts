/**
 * Contrato de IPC entre main e renderer. Importado por ambos os lados
 * (main/preload e renderer) para que request/response nunca divirjam.
 * Ver ROADMAP.md §9.5 — congelar isso antes de escrever handlers.
 */

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
}

export interface PtySpawnRequest {
  paneId: string
  cwd?: string
  shell?: string
  cols: number
  rows: number
}

export interface PtySpawnResponse {
  ptyId: string
  shell: string
  cwd: string
}

export interface PtyWriteMessage {
  ptyId: string
  data: string
}

export interface PtyResizeMessage {
  ptyId: string
  cols: number
  rows: number
}

export interface PtyKillRequest {
  ptyId: string
}

export interface PtyDataEvent {
  ptyId: string
  chunk: string
}

export interface PtyExitEvent {
  ptyId: string
  exitCode: number
  signal?: number
}

export interface ProjectInfo {
  rootPath: string
  name: string
  ghOwner: string | null
  ghRepo: string | null
}

export interface ClaudeBinaryStatus {
  available: boolean
  path: string | null
}

export const IPC_CHANNELS = {
  APP_GET_INFO: 'app:getInfo',
  PTY_SPAWN: 'pty:spawn',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_KILL: 'pty:kill',
  PTY_DATA: 'pty:data',
  PTY_EXIT: 'pty:exit',
  PROJECT_PICK_DIRECTORY: 'project:pickDirectory',
  PROJECT_GET_LAST: 'project:getLast',
  CLAUDE_CHECK_BINARY: 'claude:checkBinary'
} as const
