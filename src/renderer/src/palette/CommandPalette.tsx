import { useEffect, useMemo, useRef, useState } from 'react'
import { usePaneStore } from '../layout/paneStore'

interface Command {
  id: string
  label: string
  run: () => void
}

interface CommandPaletteProps {
  onClose: () => void
  onAddProject: () => void
}

/** Busca por substring simples. Uma lib de fuzzy para ~15 comandos não se paga. */
function normalize(text: string): string {
  return text.toLowerCase()
}

function CommandPalette({ onClose, onAddProject }: CommandPaletteProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)

  const projects = usePaneStore((state) => state.projects)
  const order = usePaneStore((state) => state.order)
  const panes = usePaneStore((state) => state.panes)
  const focusedPaneId = usePaneStore((state) => state.focusedPaneId)
  const splitFocused = usePaneStore((state) => state.splitFocused)
  const closePane = usePaneStore((state) => state.closePane)
  const toggleZoom = usePaneStore((state) => state.toggleZoom)
  const openProject = usePaneStore((state) => state.openProject)
  const addPane = usePaneStore((state) => state.addPane)

  const commands = useMemo<Command[]>(() => {
    const focusedProject = focusedPaneId ? projects[panes[focusedPaneId]?.projectPath ?? ''] : null
    const list: Command[] = [
      { id: 'add-project', label: 'Adicionar projeto…', run: onAddProject },
      { id: 'split-row', label: 'Dividir painel na horizontal', run: () => splitFocused('row') },
      { id: 'split-column', label: 'Dividir painel na vertical', run: () => splitFocused('column') },
      {
        id: 'close-pane',
        label: 'Fechar painel',
        run: () => focusedPaneId && closePane(focusedPaneId)
      },
      {
        id: 'zoom-pane',
        label: 'Maximizar/restaurar painel',
        run: () => focusedPaneId && toggleZoom(focusedPaneId)
      }
    ]
    if (focusedProject?.ghOwner && focusedProject?.ghRepo) {
      list.push({
        id: 'open-github',
        label: `Abrir painel do GitHub (${focusedProject.ghOwner}/${focusedProject.ghRepo})`,
        run: () => addPane(focusedProject.rootPath, 'github')
      })
    }
    for (const rootPath of order) {
      const info = projects[rootPath]
      if (!info) continue
      list.push({
        id: `focus-${rootPath}`,
        label: `Ir para o projeto: ${info.name}`,
        run: () => openProject(info)
      })
    }
    return list
  }, [
    projects,
    order,
    panes,
    focusedPaneId,
    onAddProject,
    splitFocused,
    closePane,
    toggleZoom,
    openProject,
    addPane
  ])

  const matches = useMemo(() => {
    const needle = normalize(query.trim())
    if (!needle) return commands
    return commands.filter((command) => normalize(command.label).includes(needle))
  }, [commands, query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setSelected(0)
  }, [query])

  function handleKeyDown(event: React.KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((index) => (matches.length === 0 ? 0 : (index + 1) % matches.length))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((index) => (matches.length === 0 ? 0 : (index - 1 + matches.length) % matches.length))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const command = matches[selected]
      if (command) {
        command.run()
        onClose()
      }
    }
  }

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          value={query}
          placeholder="Buscar comando…"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <ul className="palette-list">
          {matches.map((command, index) => (
            <li
              key={command.id}
              className={index === selected ? 'palette-item palette-item-selected' : 'palette-item'}
              onMouseEnter={() => setSelected(index)}
              onMouseDown={() => {
                command.run()
                onClose()
              }}
            >
              {command.label}
            </li>
          ))}
          {matches.length === 0 && <li className="palette-item palette-empty">nenhum comando</li>}
        </ul>
      </div>
    </div>
  )
}

export default CommandPalette
