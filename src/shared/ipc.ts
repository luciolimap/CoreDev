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

export interface RecentProjects {
  /** Ordem estável de inserção — a sidebar nunca reordena ao selecionar. */
  projects: ProjectInfo[]
  /** Último projeto ativo antes de fechar; usado só pra restaurar o pane no boot. */
  lastActivePath: string | null
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
  PROJECT_LIST_RECENTS: 'project:listRecents',
  PROJECT_SET_ACTIVE: 'project:setActive',
  CLAUDE_CHECK_BINARY: 'claude:checkBinary',
  SESSION_LOAD: 'session:load',
  SESSION_SAVE: 'session:save',
  SESSION_LOAD_SCROLLBACK: 'session:loadScrollback',
  SESSION_SAVE_SCROLLBACK: 'session:saveScrollback'
} as const

/**
 * Espelho estrutural do `MosaicNode<string>` do react-mosaic. Existe para o
 * processo main persistir o layout sem depender de uma lib de UI do renderer.
 */
export type LayoutNode =
  | string
  | {
      type: 'split'
      direction: 'row' | 'column'
      children: LayoutNode[]
      splitPercentages?: number[]
    }
  | { type: 'tabs'; tabs: string[]; activeTabIndex: number }

export type PaneKind = 'terminal' | 'github'

export interface PaneSnapshot {
  cwd: string
  bootCommand?: string | undefined
  projectPath: string
  kind: PaneKind
}

/** Versão do formato do `session.json`; snapshot de outra versão é descartado no boot. */
export const SESSION_VERSION = 1

export interface SessionSnapshot {
  version: number
  layout: LayoutNode | null
  panes: Record<string, PaneSnapshot>
  focusedPaneId: string | null
  zoomedPaneId: string | null
}

export interface ScrollbackWriteRequest {
  paneId: string
  data: string
}
