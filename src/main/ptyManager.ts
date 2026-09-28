import { randomUUID } from 'crypto'
import os from 'os'
import type { IPty } from 'node-pty'
import * as pty from 'node-pty'
import type { WebContents } from 'electron'
import type { PtyCwdEvent, PtyDataEvent, PtyExitEvent } from '../shared/ipc'
import { parseOsc7Cwd } from './osc7'
import { IPC_CHANNELS } from '../shared/ipc'

interface PtyEntry {
  proc: IPty
  paneId: string
  cwd: string
  shell: string
  pendingChunks: string[]
  pendingBytes: number
}

/** Frame de coalescência da saída pty -> renderer. Ver ROADMAP.md §3.3. */
const FLUSH_INTERVAL_MS = 16
const FLUSH_BYTE_THRESHOLD = 64 * 1024

function defaultShell(): string {
  if (process.platform === 'win32') {
    return 'powershell.exe'
  }
  return process.env.SHELL ?? '/bin/bash'
}

function shellArgs(): string[] {
  if (process.platform === 'win32') return []
  // login shell: garante PATH completo (nvm, pyenv, etc.) — essencial
  // para o binário `claude` ser encontrado. Ver ROADMAP.md §3.3.
  return ['-l']
}

export class PtyManager {
  private ptys = new Map<string, PtyEntry>()
  private getWebContents: () => WebContents | null
  private flushTimer: NodeJS.Timeout | null = null

  constructor(getWebContents: () => WebContents | null) {
    this.getWebContents = getWebContents
  }

  spawn(opts: { paneId: string; cwd?: string; shell?: string; cols: number; rows: number }): {
    ptyId: string
    shell: string
    cwd: string
  } {
    const shell = opts.shell ?? defaultShell()
    const cwd = opts.cwd ?? os.homedir()
    const proc = pty.spawn(shell, shellArgs(), {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      } as { [key: string]: string }
    })

    const ptyId = randomUUID()
    const entry: PtyEntry = {
      proc,
      paneId: opts.paneId,
      cwd,
      shell,
      pendingChunks: [],
      pendingBytes: 0
    }
    this.ptys.set(ptyId, entry)

    proc.onData((chunk) => {
      const announced = parseOsc7Cwd(chunk)
      if (announced && announced !== entry.cwd) {
        entry.cwd = announced
        const event: PtyCwdEvent = { ptyId, cwd: announced }
        this.getWebContents()?.send(IPC_CHANNELS.PTY_CWD, event)
      }
      entry.pendingChunks.push(chunk)
      entry.pendingBytes += chunk.length
      this.ensureFlushLoop()
      if (entry.pendingBytes > FLUSH_BYTE_THRESHOLD) {
        this.flushOne(ptyId, entry)
      }
    })

    proc.onExit(({ exitCode, signal }) => {
      this.flushOne(ptyId, entry)
      this.ptys.delete(ptyId)
      const event: PtyExitEvent =
        signal === undefined ? { ptyId, exitCode } : { ptyId, exitCode, signal }
      this.getWebContents()?.send(IPC_CHANNELS.PTY_EXIT, event)
    })

    return { ptyId, shell, cwd }
  }

  write(ptyId: string, data: string): void {
    this.ptys.get(ptyId)?.proc.write(data)
  }

  resize(ptyId: string, cols: number, rows: number): void {
    const entry = this.ptys.get(ptyId)
    if (!entry) return
    // cols/rows de 0 acontecem durante transições de layout (painel
    // temporariamente sem dimensão) e travam o ConPTY no Windows.
    if (cols <= 0 || rows <= 0) return
    try {
      entry.proc.resize(cols, rows)
    } catch {
      // resize pode falhar em corridas raras (processo acabou de sair)
    }
  }

  kill(ptyId: string): void {
    this.ptys.get(ptyId)?.proc.kill()
    this.ptys.delete(ptyId)
  }

  killAll(): void {
    for (const [, entry] of this.ptys) {
      try {
        entry.proc.kill()
      } catch {
        // best-effort no shutdown
      }
    }
    this.ptys.clear()
  }

  private ensureFlushLoop(): void {
    if (this.flushTimer) return
    this.flushTimer = setInterval(() => this.flushAll(), FLUSH_INTERVAL_MS)
  }

  private flushAll(): void {
    let anyPending = false
    for (const [ptyId, entry] of this.ptys) {
      if (entry.pendingBytes > 0) {
        this.flushOne(ptyId, entry)
        anyPending = true
      }
    }
    if (!anyPending && this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  private flushOne(ptyId: string, entry: PtyEntry): void {
    if (entry.pendingChunks.length === 0) return
    const chunk = entry.pendingChunks.join('')
    entry.pendingChunks = []
    entry.pendingBytes = 0
    const event: PtyDataEvent = { ptyId, chunk }
    this.getWebContents()?.send(IPC_CHANNELS.PTY_DATA, event)
  }
}
