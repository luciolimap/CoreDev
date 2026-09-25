import type { ReactNode } from 'react'
import { focusTerminal } from '../terminal/terminalRegistry'
import { usePaneStore } from './paneStore'

interface PaneFrameProps {
  paneId: string
  children: ReactNode
}

function shortenCwd(cwd: string | undefined): string {
  if (!cwd) return ''
  const parts = cwd.split(/[\\/]/).filter(Boolean)
  return parts.length <= 2 ? cwd : `…/${parts.slice(-2).join('/')}`
}

function PaneFrame({ paneId, children }: PaneFrameProps): React.JSX.Element {
  const cwd = usePaneStore((state) => state.panes[paneId]?.cwd)
  const isFocused = usePaneStore((state) => state.focusedPaneId === paneId)
  const isZoomed = usePaneStore((state) => state.zoomedPaneId === paneId)
  const canClose = usePaneStore((state) => Object.keys(state.panes).length > 1)
  const focusPane = usePaneStore((state) => state.focusPane)
  const closePane = usePaneStore((state) => state.closePane)
  const toggleZoom = usePaneStore((state) => state.toggleZoom)

  function handleMouseDown(): void {
    focusPane(paneId)
    // Chamada explícita: ver o comentário em terminalRegistry.ts sobre a
    // corrida entre este `set()` e o foco nativo do xterm.js no clique.
    focusTerminal(paneId)
  }

  return (
    <div
      className={`pane-frame${isFocused ? ' pane-frame-focused' : ''}`}
      onMouseDownCapture={handleMouseDown}
    >
      <div className="pane-frame-header">
        <span className="pane-frame-title">{shortenCwd(cwd)}</span>
        <div className="pane-frame-actions">
          <button
            className="pane-frame-action"
            title="Maximizar/restaurar (Ctrl/Cmd+Shift+Enter)"
            onClick={() => toggleZoom(paneId)}
          >
            {isZoomed ? '⤡' : '⤢'}
          </button>
          {canClose && (
            <button
              className="pane-frame-action"
              title="Fechar painel"
              onClick={() => closePane(paneId)}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="pane-frame-body">{children}</div>
    </div>
  )
}

export default PaneFrame
