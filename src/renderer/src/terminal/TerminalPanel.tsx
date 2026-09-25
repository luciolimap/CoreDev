import { useEffect, useRef, useState } from 'react'
import { acquireTerminal, ensureSpawned, getPtyId, setPtyId } from './terminalRegistry'
import type { PtySpawnRequest } from '../../../shared/ipc'

interface TerminalPanelProps {
  paneId: string
  cwd?: string
  /** Comando escrito no pty logo após um spawn novo (não em reconexão a um pty existente). */
  bootCommand?: string
}

const RESIZE_DEBOUNCE_MS = 100
// Tempo dado ao shell pra terminar de avaliar o profile antes de escrever o
// bootCommand. Heurística simples (ROADMAP.md §6.3, fallback de quiescência);
// uma sentinela OSC é a solução robusta, mas fica para a Fase 5.
const BOOT_COMMAND_DELAY_MS = 300

function spawnRequest(
  paneId: string,
  cwd: string | undefined,
  cols: number,
  rows: number
): PtySpawnRequest {
  return cwd === undefined ? { paneId, cols, rows } : { paneId, cwd, cols, rows }
}

function TerminalPanel({ paneId, cwd, bootCommand }: TerminalPanelProps): React.JSX.Element {
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
    let bootTimer: ReturnType<typeof setTimeout> | null = null
    void ensureSpawned(paneId, () =>
      window.hub.pty.spawn(spawnRequest(paneId, cwd, cols, rows))
    ).then((ptyId) => {
      if (!wasAlreadySpawned && bootCommand) {
        bootTimer = setTimeout(() => {
          window.hub.pty.write(ptyId, `${bootCommand}\r`)
        }, BOOT_COMMAND_DELAY_MS)
      }
    })

    const unsubData = window.hub.pty.onData(({ ptyId, chunk }) => {
      if (ptyId === getPtyId(paneId)) entry.term.write(chunk)
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
      if (bootTimer) clearTimeout(bootTimer)
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
  }, [paneId, cwd])

  async function handleRestart(): Promise<void> {
    const ptyId = getPtyId(paneId)
    if (ptyId) await window.hub.pty.kill(ptyId)
    setExited(null)
    setPtyId(paneId, null)
    const entry = acquireTerminal(paneId)
    entry.term.reset()
    const { cols, rows } = entry.term
    const newPtyId = await ensureSpawned(paneId, () =>
      window.hub.pty.spawn(spawnRequest(paneId, cwd, cols, rows))
    )
    if (bootCommand) {
      setTimeout(() => window.hub.pty.write(newPtyId, `${bootCommand}\r`), BOOT_COMMAND_DELAY_MS)
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
