import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/ipc'

function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.hub.app.getInfo().then(setInfo)
  }, [])

  return (
    <div className="app-shell">
      <aside className="sidebar" />
      <main className="main">
        <header className="toolbar">CoreDev — Fase 0 (scaffold)</header>
        <section className="content">
          <p>Janela Electron + React + TypeScript rodando via IPC.</p>
          <p>
            {info
              ? `versão ${info.version} · ${info.platform}`
              : 'aguardando resposta do main process…'}
          </p>
        </section>
      </main>
    </div>
  )
}

export default App
