import { Mosaic } from 'react-mosaic-component'
import TerminalPanel from '../terminal/TerminalPanel'
import PaneFrame from './PaneFrame'
import { usePaneStore } from './paneStore'

function MosaicRoot(): React.JSX.Element {
  const layout = usePaneStore((state) => state.layout)
  const panes = usePaneStore((state) => state.panes)
  const setLayout = usePaneStore((state) => state.setLayout)

  return (
    <Mosaic<string>
      value={layout}
      onChange={setLayout}
      renderTile={(paneId): React.JSX.Element => (
        <PaneFrame paneId={paneId}>
          <TerminalPanel
            paneId={paneId}
            cwd={panes[paneId]?.cwd}
            bootCommand={panes[paneId]?.bootCommand}
          />
        </PaneFrame>
      )}
    />
  )
}

export default MosaicRoot
