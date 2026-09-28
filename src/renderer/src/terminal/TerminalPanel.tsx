import { useEffect, useRef, useState } from 'react'
import { acquireTerminal, claimRestore, ensureSpawned, getPtyId, setPtyId } from './terminalRegistry'
import type { PtySpawnRequest } from '../../../shared/ipc'

interface TerminalPanelProps {
  paneId: string
  cwd?: string | undefined
  /** Usado quando o `cwd` salvo não existe mais no disco (projeto movido ou apagado). */
  fallbackCwd?: string | undefined
  /** Comando escrito no pty logo após um spawn novo (não em reconexão a um pty existente). */
  bootCommand?: string | undefined
}

const RESIZE_DEBOUNCE_MS = 100

/**
 * Detecção de "shell pronto" por quiescência (ROADMAP.md §6.3): o `bootCommand`
 * só é escrito depois que o shell fica um tempo sem emitir nada. Um atraso fixo
 * erra nos dois sentidos — rápido demais para um profile com nvm/starship,
 * lento demais para um shell sem profile. O teto existe porque um prompt que
 * anima (spinner, relógio) nunca fica quieto.
 */
const SHELL_QUIET_MS = 250
const SHELL_READY_TIMEOUT_MS = 3000

function previousSessionSeparator(): string {
  const when = new Date().toLocaleString()
  return `\r\n\x1b[2m─── fim da sessão anterior · ${when} ───\x1b[0m\r\n`
}

function cwdChangedWarning(requested: string, actual: string): string {
  return `\r\n\x1b[33m${requested} não existe mais — abrindo em ${actual}\x1b[0m\r\n`
}

function spawnRequest(
  paneId: string,
  cwd: string | undefined,
  fallbackCwd: string | undefined,
  cols: number,
  rows: number
): PtySpawnRequest {
  const base: PtySpawnRequest = { paneId, cols, rows }
  if (cwd !== undefined) base.cwd = cwd
  if (fallbackCwd !== undefined) base.fallbackCwd = fallbackCwd
  return base
}

function TerminalPanel({
  paneId,
  cwd,
  fallbackCwd,
  bootCommand
}: TerminalPanelProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [exited, setExited] = useState<{ exitCode: number } | null>(null)

  // Reparenta o host do xterm.js (nunca recria) e faz spawn do pty na
  // primeira vez que este paneId aparece. Ver terminalRegistry.ts.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const entry = acquireTerminal(paneId)
    container.appendChild(entry.el)
    entry.fit.fit()

    const { cols, rows } = entry.term
    const wasAlreadySpawned = getPtyId(paneId) !== null

    let bootSent = false
    let quietTimer: ReturnType<typeof setTimeout> | null = null
    let hardTimer: ReturnType<typeof setTimeout> | null = null

    function sendBootCommand(ptyId: string): void {
      if (bootSent || !bootCommand) return
      bootSent = true
      window.hub.pty.write(ptyId, `${bootCommand}\r`)
    }

    function restartQuietWindow(ptyId: string): void {
      if (quietTimer) clearTimeout(quietTimer)
      quietTimer = setTimeout(() => sendBootCommand(ptyId), SHELL_QUIET_MS)
    }

    // O scrollback da sessão anterior entra antes do spawn: escrever depois
    // disputaria a tela com a saída do shell novo.
    const restored = claimRestore(paneId)
      ? window.hub.session.loadScrollback(paneId).then((data) => {
          if (!data) return
          entry.term.write(data)
          entry.term.write(previousSessionSeparator())
        })
      : Promise.resolve()

    void restored
      .then(() =>
        ensureSpawned(paneId, async () => {
          const res = await window.hub.pty.spawn(spawnRequest(paneId, cwd, fallbackCwd, cols, rows))
          if (cwd && res.cwd !== cwd) entry.term.write(cwdChangedWarning(cwd, res.cwd))
          return res
        })
      )
      .then((ptyId) => {
        if (wasAlreadySpawned || !bootCommand) return
        restartQuietWindow(ptyId)
        hardTimer = setTimeout(() => sendBootCommand(ptyId), SHELL_READY_TIMEOUT_MS)
      })

    const unsubData = window.hub.pty.onData(({ ptyId, chunk }) => {
      if (ptyId !== getPtyId(paneId)) return
      entry.term.write(chunk)
      // Enquanto o shell fala, ele não está pronto: adia o bootCommand.
      if (!bootSent && bootCommand && !wasAlreadySpawned) restartQuietWindow(ptyId)
    })
    const unsubExit = window.hub.pty.onExit(({ ptyId, exitCode }) => {
      if (ptyId === getPtyId(paneId)) setExited({ exitCode })
    })

    const onData = entry.term.onData((data) => {
      const ptyId = getPtyId(paneId)
      if (ptyId) window.hub.pty.write(ptyId, data)
    })

    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        entry.fit.fit()
        const ptyId = getPtyId(paneId)
        if (ptyId) window.hub.pty.resize(ptyId, entry.term.cols, entry.term.rows)
      }, RESIZE_DEBOUNCE_MS)
    })
    resizeObserver.observe(container)

    return (): void => {
      if (resizeTimer) clearTimeout(resizeTimer)
      if (quietTimer) clearTimeout(quietTimer)
      if (hardTimer) clearTimeout(hardTimer)
      resizeObserver.disconnect()
      unsubData()
      unsubExit()
      onData.dispose()
      entry.el.remove() // reparenta pra fora — não destrói a instância
    }
    // bootCommand não entra nas deps: só importa no primeiro spawn deste
    // paneId (App.tsx só monta o painel depois que bootCommand já é
    // conhecido — ver App.tsx). Mudar só o bootCommand não deve reiniciar
    // o pty nem reescrever o comando numa sessão já em andamento.
  }, [paneId, cwd, fallbackCwd])

  async function handleRestart(): Promise<void> {
    const ptyId = getPtyId(paneId)
    if (ptyId) await window.hub.pty.kill(ptyId)
    setExited(null)
    setPtyId(paneId, null)
    const entry = acquireTerminal(paneId)
    entry.term.reset()
    const { cols, rows } = entry.term
    const newPtyId = await ensureSpawned(paneId, () =>
      window.hub.pty.spawn(spawnRequest(paneId, cwd, fallbackCwd, cols, rows))
    )
    if (bootCommand) {
      setTimeout(() => window.hub.pty.write(newPtyId, `${bootCommand}\r`), SHELL_QUIET_MS)
    }
  }

  return (
    <div className="terminal-panel">
      <div ref={containerRef} className="terminal-host" />
      {exited && (
        <div className="terminal-exited-overlay">
          <span>processo encerrado — código {exited.exitCode}</span>
          <button onClick={handleRestart}>Reiniciar</button>
        </div>
      )}
    </div>
  )
}

export default TerminalPanel
