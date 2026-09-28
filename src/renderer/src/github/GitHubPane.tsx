import { useCallback, useEffect, useState } from 'react'
import { usePaneStore } from '../layout/paneStore'
import { getPtyId } from '../terminal/terminalRegistry'
import type { GhIssue, GhPullRequest, GhResult } from '../../../shared/ipc'

interface GitHubPaneProps {
  projectPath: string
}

type View = 'pulls' | 'issues'

const CI_LABEL: Record<GhPullRequest['ci'], string> = {
  success: '●',
  failure: '●',
  pending: '●',
  none: '○'
}

function FailureState({ result }: { result: Extract<GhResult<never>, { ok: false }> }): React.JSX.Element {
  return (
    <div className="github-pane-error">
      <p>{result.message}</p>
      {result.reason === 'missing' && (
        <a href="https://cli.github.com" target="_blank" rel="noreferrer">
          Instalar o GitHub CLI
        </a>
      )}
    </div>
  )
}

function GitHubPane({ projectPath }: GitHubPaneProps): React.JSX.Element {
  const project = usePaneStore((state) => state.projects[projectPath])
  const panes = usePaneStore((state) => state.panes)
  const addPane = usePaneStore((state) => state.addPane)

  const [view, setView] = useState<View>('pulls')
  const [pulls, setPulls] = useState<GhResult<GhPullRequest> | null>(null)
  const [issues, setIssues] = useState<GhResult<GhIssue> | null>(null)
  const [loading, setLoading] = useState(false)

  const repo = project?.ghOwner && project?.ghRepo ? `${project.ghOwner}/${project.ghRepo}` : null

  const refresh = useCallback(async (): Promise<void> => {
    if (!repo) return
    setLoading(true)
    const result =
      view === 'pulls'
        ? await window.hub.github.listPulls(repo)
        : await window.hub.github.listIssues(repo)
    if (view === 'pulls') setPulls(result as GhResult<GhPullRequest>)
    else setIssues(result as GhResult<GhIssue>)
    setLoading(false)
  }, [repo, view])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * O checkout roda no terminal do projeto, à vista (ROADMAP §6): o dev vê o
   * comando e o resultado. Sem terminal daquele projeto no canvas, abre um já
   * com o checkout como `bootCommand` — assim a espera pelo shell ficar pronto
   * é a mesma do resto do app, sem um caminho de espera só para este caso.
   */
  function checkoutPull(number: number): void {
    const command = `gh pr checkout ${number}`
    const terminalPaneId = Object.keys(panes).find(
      (id) => panes[id]?.projectPath === projectPath && panes[id]?.kind === 'terminal'
    )
    if (!terminalPaneId) {
      addPane(projectPath, 'terminal', command)
      return
    }
    const ptyId = getPtyId(terminalPaneId)
    if (ptyId) window.hub.pty.write(ptyId, `${command}\r`)
  }

  if (!repo) {
    return (
      <div className="github-pane">
        <div className="github-pane-error">
          <p>Este projeto não tem um remote `origin` no GitHub.</p>
        </div>
      </div>
    )
  }

  const result = view === 'pulls' ? pulls : issues

  return (
    <div className="github-pane">
      <div className="github-pane-tabs">
        <button
          className={view === 'pulls' ? 'github-tab github-tab-active' : 'github-tab'}
          onClick={() => setView('pulls')}
        >
          Pull requests
        </button>
        <button
          className={view === 'issues' ? 'github-tab github-tab-active' : 'github-tab'}
          onClick={() => setView('issues')}
        >
          Issues
        </button>
        <span className="github-pane-repo">{repo}</span>
        <button className="github-tab" onClick={() => void refresh()} title="Atualizar">
          ↻
        </button>
      </div>

      {loading && <div className="github-pane-empty">carregando…</div>}
      {!loading && result?.ok === false && <FailureState result={result} />}
      {!loading && result?.ok && result.items.length === 0 && (
        <div className="github-pane-empty">nada aberto por aqui</div>
      )}

      {!loading && result?.ok && view === 'pulls' && (
        <ul className="github-list">
          {(result.items as GhPullRequest[]).map((pull) => (
            <li key={pull.number} className="github-item">
              <span className={`github-ci github-ci-${pull.ci}`} title={`CI: ${pull.ci}`}>
                {CI_LABEL[pull.ci]}
              </span>
              <span className="github-number">#{pull.number}</span>
              <span className="github-title">{pull.title}</span>
              <span className="github-meta">
                {pull.author} · {pull.headRefName}
              </span>
              <button className="github-action" onClick={() => checkoutPull(pull.number)}>
                checkout
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && result?.ok && view === 'issues' && (
        <ul className="github-list">
          {(result.items as GhIssue[]).map((issue) => (
            <li key={issue.number} className="github-item">
              <span className="github-number">#{issue.number}</span>
              <span className="github-title">{issue.title}</span>
              <span className="github-meta">
                {issue.author}
                {issue.labels.length > 0 && ` · ${issue.labels.join(', ')}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default GitHubPane
