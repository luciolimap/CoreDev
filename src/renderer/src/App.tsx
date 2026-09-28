import { useCallback, useEffect, useState } from 'react'
import MosaicRoot from './layout/MosaicRoot'
import PaneFrame from './layout/PaneFrame'
import { usePaneStore } from './layout/paneStore'
import CommandPalette from './palette/CommandPalette'
import { renderPaneContent } from './layout/renderPane'
import { startSessionSync } from './layout/sessionSync'
import Sidebar from './sidebar/Sidebar'
import type { ClaudeBinaryStatus } from '../../shared/ipc'

function App(): React.JSX.Element {
  const [loadingRecents, setLoadingRecents] = useState(true)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [claudeStatus, setClaudeStatus] = useState<ClaudeBinaryStatus | null>(null)

  const hydrateRecents = usePaneStore((state) => state.hydrateRecents)
  const hydrateSession = usePaneStore((state) => state.hydrateSession)
  const openProject = usePaneStore((state) => state.openProject)
  const splitFocused = usePaneStore((state) => state.splitFocused)
  const addPane = usePaneStore((state) => state.addPane)
  const focusByIndex = usePaneStore((state) => state.focusByIndex)
  const toggleZoom = usePaneStore((state) => state.toggleZoom)
  const layout = usePaneStore((state) => state.layout)
  const panes = usePaneStore((state) => state.panes)
  const focusedPaneId = usePaneStore((state) => state.focusedPaneId)
  const zoomedPaneId = usePaneStore((state) => state.zoomedPaneId)
  const projects = usePaneStore((state) => state.projects)
  const lastActivePath = usePaneStore((state) => state.lastActivePath)

  const focusedProject = focusedPaneId ? projects[panes[focusedPaneId]?.projectPath ?? ''] : null

  useEffect(() => {
    window.hub.claude.checkBinary().then(setClaudeStatus)
  }, [])

  useEffect(() => {
    window.hub.project.listRecents().then((data) => {
      hydrateRecents(data)
      setLoadingRecents(false)
    })
  }, [hydrateRecents])

  // A sessão anterior tem precedência sobre o auto-open: só depois de saber
  // que não há layout salvo é que o último projeto ativo é aberto sozinho.
  // O autosave só liga aqui, senão o estado vazio do boot sobrescreveria o arquivo.
  useEffect((): (() => void) => {
    let stop: (() => void) | undefined
    let cancelled = false
    window.hub.session.load().then((snapshot) => {
      if (snapshot?.layout) hydrateSession(snapshot)
      setSessionChecked(true)
      stop = startSessionSync()
      // O cleanup pode ter rodado antes desta promise resolver (StrictMode monta,
      // desmonta e monta de novo); sem isto ficavam dois autosaves vivos.
      if (cancelled) stop()
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [hydrateSession])

  // Abre o último projeto ativo automaticamente assim que a lista e o status
  // do claude estiverem prontos — só na primeira vez (canvas ainda vazio).
  useEffect(() => {
    if (!sessionChecked || loadingRecents || claudeStatus === null || layout) return
    const info = lastActivePath ? projects[lastActivePath] : undefined
    if (info) openProject(info, claudeStatus.available ? 'claude' : undefined)
  }, [sessionChecked, loadingRecents, claudeStatus, layout, lastActivePath, projects, openProject])

  const pickRoot = useCallback(async (): Promise<void> => {
    hydrateRecents(await window.hub.project.pickRoot())
  }, [hydrateRecents])

  const createProject = useCallback(async (): Promise<void> => {
    const created = await window.hub.project.create()
    if (created) openProject(created, claudeStatus?.available ? 'claude' : undefined)
  }, [openProject, claudeStatus])

  const pickProject = useCallback(async (): Promise<void> => {
    const picked = await window.hub.project.pickDirectory()
    if (picked) openProject(picked, claudeStatus?.available ? 'claude' : undefined)
  }, [openProject, claudeStatus])

  // Atalhos: Ctrl/Cmd+Shift+Enter zoom, Ctrl/Cmd+1..9 foca painel por índice.
  useEffect((): (() => void) => {
    function onKeyDown(event: KeyboardEvent): void {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        event.stopPropagation()
        setPaletteOpen((open) => !open)
        return
      }
      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault()
        if (focusedPaneId) toggleZoom(focusedPaneId)
        return
      }
      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault()
        focusByIndex(Number(event.key) - 1)
      }
    }
    // Captura, não bolha: o xterm.js trata o keydown antes e mapeia Ctrl+K para
    // `` (kill-line), que ia parar no pty. Ele chama `preventDefault` mas não
    // `stopPropagation`, então a paleta abria junto com o comando indo para o shell.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [focusedPaneId, toggleZoom, focusByIndex])

  if (loadingRecents || claudeStatus === null || !sessionChecked) {
    return <div className="app-shell-empty" />
  }

  return (
    <div className="app-root">
      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onAddProject={pickProject}
          claudeAvailable={claudeStatus.available}
        />
      )}
      <Sidebar
        onAddProject={pickProject}
        onCreateProject={createProject}
        onPickRoot={pickRoot}
        claudeAvailable={claudeStatus.available}
      />
      {!layout ? (
        <div className="app-shell-empty">
          <div className="empty-state">
            <h1>CoreDev</h1>
            <p>Selecione a pasta de um projeto para começar.</p>
            <button onClick={pickProject}>Adicionar projeto</button>
          </div>
        </div>
      ) : (
        <div className="app-shell">
          <header className="toolbar">
            {focusedProject && (
              <>
                <span className="toolbar-project">{focusedProject.name}</span>
                {focusedProject.ghOwner && focusedProject.ghRepo && (
                  <span className="toolbar-repo">
                    {focusedProject.ghOwner}/{focusedProject.ghRepo}
                  </span>
                )}
              </>
            )}
            <div className="toolbar-spacer" />
            {focusedProject?.ghOwner && focusedProject?.ghRepo && (
              <button
                className="toolbar-icon-btn"
                title={`Painel do GitHub (${focusedProject.ghOwner}/${focusedProject.ghRepo})`}
                onClick={() => addPane(focusedProject.rootPath, 'github')}
              >
                ⑂
              </button>
            )}
            <button
              className="toolbar-icon-btn"
              title="Novo terminal no mesmo projeto (horizontal)"
              onClick={() => splitFocused('row')}
            >
              ⬓
            </button>
            <button
              className="toolbar-icon-btn"
              title="Novo terminal no mesmo projeto (vertical)"
              onClick={() => splitFocused('column')}
            >
              ⬒
            </button>
          </header>
          {!claudeStatus.available && (
            <div className="claude-missing-banner">
              Binário <code>claude</code> não encontrado no PATH.{' '}
              <a
                href="https://docs.claude.com/en/docs/claude-code"
                target="_blank"
                rel="noreferrer"
              >
                Instruções de instalação
              </a>
              .
            </div>
          )}
          <div className="app-terminal-area">
            {zoomedPaneId ? (
              <PaneFrame paneId={zoomedPaneId}>
                {renderPaneContent(zoomedPaneId, panes[zoomedPaneId])}
              </PaneFrame>
            ) : (
              <MosaicRoot />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
