import { useMemo } from 'react'
import { usePaneStore } from '../layout/paneStore'

interface SidebarProps {
  onAddProject: () => void
  onCreateProject: () => void
  onPickRoot: () => void
  claudeAvailable: boolean
}

function Sidebar({
  onAddProject,
  onCreateProject,
  onPickRoot,
  claudeAvailable
}: SidebarProps): React.JSX.Element {
  const order = usePaneStore((state) => state.order)
  const projects = usePaneStore((state) => state.projects)
  const pinned = usePaneStore((state) => state.pinned)
  const projectsRoot = usePaneStore((state) => state.projectsRoot)
  const openProject = usePaneStore((state) => state.openProject)
  const togglePin = usePaneStore((state) => state.togglePin)
  const focusedProjectPath = usePaneStore((state) =>
    state.focusedPaneId ? state.panes[state.focusedPaneId]?.projectPath : null
  )

  // Fixados primeiro; dentro de cada grupo, a ordem de inserção original continua
  // valendo — clicar num projeto nunca reordena a lista sob o cursor.
  const displayOrder = useMemo(() => {
    const isPinned = (path: string): boolean => pinned.includes(path)
    return [...order.filter(isPinned), ...order.filter((path) => !isPinned(path))]
  }, [order, pinned])

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Projetos</span>
        <button className="sidebar-add-btn" title="Criar projeto novo" onClick={onCreateProject}>
          ✳
        </button>
        <button
          className="sidebar-add-btn"
          title="Adicionar projeto existente"
          onClick={onAddProject}
        >
          ＋
        </button>
        <button
          className="sidebar-add-btn"
          title={
            projectsRoot
              ? `Pasta raiz: ${projectsRoot} (clique para trocar)`
              : 'Escolher a pasta raiz de projetos'
          }
          onClick={onPickRoot}
        >
          ⌂
        </button>
      </div>
      <div className="sidebar-list">
        {displayOrder.map((path) => {
          const info = projects[path]
          if (!info) return null
          const isPinned = pinned.includes(path)
          return (
            <div key={path} className="sidebar-row">
              <button
                className={`sidebar-item${path === focusedProjectPath ? ' sidebar-item-active' : ''}`}
                onClick={() => openProject(info, claudeAvailable ? 'claude' : undefined)}
                title={path}
              >
                <span className="sidebar-item-name">{info.name}</span>
                {info.ghOwner && info.ghRepo && (
                  <span className="sidebar-item-repo">
                    {info.ghOwner}/{info.ghRepo}
                  </span>
                )}
              </button>
              <button
                className={`sidebar-pin${isPinned ? ' sidebar-pin-active' : ''}`}
                title={isPinned ? 'Desafixar do topo' : 'Fixar no topo'}
                aria-pressed={isPinned}
                onClick={() => togglePin(path)}
              >
                ★
              </button>
            </div>
          )
        })}
        {displayOrder.length === 0 && !projectsRoot && (
          <p className="sidebar-hint">
            Escolha a pasta raiz em ⌂ para listar seus projetos automaticamente.
          </p>
        )}
      </div>
    </aside>
  )
}

export default Sidebar
