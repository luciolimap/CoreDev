import { usePaneStore } from '../layout/paneStore'

interface SidebarProps {
  onAddProject: () => void
  claudeAvailable: boolean
}

function Sidebar({ onAddProject, claudeAvailable }: SidebarProps): React.JSX.Element {
  const order = usePaneStore((state) => state.order)
  const projects = usePaneStore((state) => state.projects)
  const openProject = usePaneStore((state) => state.openProject)
  const focusedProjectPath = usePaneStore((state) =>
    state.focusedPaneId ? state.panes[state.focusedPaneId]?.projectPath : null
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Projetos</span>
        <button className="sidebar-add-btn" title="Adicionar projeto" onClick={onAddProject}>
          ＋
        </button>
      </div>
      <div className="sidebar-list">
        {order.map((path) => {
          const info = projects[path]
          if (!info) return null
          return (
            <button
              key={path}
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
          )
        })}
      </div>
    </aside>
  )
}

export default Sidebar
