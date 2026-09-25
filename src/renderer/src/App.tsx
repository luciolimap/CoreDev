import TerminalPanel from './terminal/TerminalPanel'

function App(): React.JSX.Element {
  return (
    <div className="app-shell-fullterm">
      <TerminalPanel paneId="fase1-terminal" />
    </div>
  )
}

export default App
