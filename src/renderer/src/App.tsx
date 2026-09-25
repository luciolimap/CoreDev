import { useCallback, useEffect, useState } from 'react'
import TerminalPanel from './terminal/TerminalPanel'
import type { ClaudeBinaryStatus, ProjectInfo } from '../../shared/ipc'

function App(): React.JSX.Element {
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [loadingLast, setLoadingLast] = useState(true)
  const [claudeStatus, setClaudeStatus] = useState<ClaudeBinaryStatus | null>(null)

  useEffect(() => {
    window.hub.claude.checkBinary().then(setClaudeStatus)
  }, [])

  useEffect(() => {
    window.hub.project.getLast().then((p) => {
      setProject(p)
      setLoadingLast(false)
    })
  }, [])

  const pickProject = useCallback(async (): Promise<void> => {
    const picked = await window.hub.project.pickDirectory()
    if (picked) setProject(picked)
  }, [])

  // Espera os dois carregamentos: sem claudeStatus resolvido, o TerminalPanel
  // não pode montar ainda, senão o bootCommand chega tarde demais pro
  // primeiro spawn (ver TerminalPanel.tsx).
  if (loadingLast || claudeStatus === null) {
    return <div className="app-shell-empty" />
  }

  if (!project) {
    return (
      <div className="app-shell-empty">
        <div className="empty-state">
          <h1>CoreDev</h1>
          <p>Selecione a pasta de um projeto para começar.</p>
          <button onClick={pickProject}>Adicionar projeto</button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="toolbar">
        <button className="toolbar-project" onClick={pickProject} title="Trocar de projeto">
          {project.name}
        </button>
        {project.ghOwner && project.ghRepo && (
          <span className="toolbar-repo">
            {project.ghOwner}/{project.ghRepo}
          </span>
        )}
      </header>
      {!claudeStatus.available && (
        <div className="claude-missing-banner">
          Binário <code>claude</code> não encontrado no PATH.{' '}
          <a href="https://docs.claude.com/en/docs/claude-code" target="_blank" rel="noreferrer">
            Instruções de instalação
          </a>
          .
        </div>
      )}
      <div className="app-terminal-area">
        {claudeStatus.available ? (
          <TerminalPanel paneId={project.rootPath} cwd={project.rootPath} bootCommand="claude" />
        ) : (
          <TerminalPanel paneId={project.rootPath} cwd={project.rootPath} />
        )}
      </div>
    </div>
  )
}

export default App
