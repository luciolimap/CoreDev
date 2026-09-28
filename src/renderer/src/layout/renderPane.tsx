import GitHubPane from '../github/GitHubPane'
import TerminalPanel from '../terminal/TerminalPanel'
import type { PaneMeta } from './paneStore'

/** Um só lugar decide o componente de um pane — o canvas e o zoom renderizam pelo mesmo caminho. */
export function renderPaneContent(paneId: string, meta: PaneMeta | undefined): React.JSX.Element {
  if (meta?.kind === 'github') {
    return <GitHubPane projectPath={meta.projectPath} />
  }
  return (
    <TerminalPanel
      paneId={paneId}
      cwd={meta?.cwd}
      fallbackCwd={meta?.projectPath}
      bootCommand={meta?.bootCommand}
    />
  )
}
