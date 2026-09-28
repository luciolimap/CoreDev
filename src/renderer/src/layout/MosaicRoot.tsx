import { Mosaic } from 'react-mosaic-component'
import PaneFrame from './PaneFrame'
import { renderPaneContent } from './renderPane'
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
        <PaneFrame paneId={paneId}>{renderPaneContent(paneId, panes[paneId])}</PaneFrame>
      )}
    />
  )
}

export default MosaicRoot
