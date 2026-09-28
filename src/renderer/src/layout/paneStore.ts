import { create } from 'zustand'
import { createRemoveUpdate, getLeaves, updateTree } from 'react-mosaic-component'
import type { MosaicDirection, MosaicNode } from 'react-mosaic-component'
import type { PaneKind, ProjectInfo, RecentProjects, SessionSnapshot } from '../../../shared/ipc'
import { getPtyId, releaseTerminal } from '../terminal/terminalRegistry'
import { findPanePath } from './mosaicTree'

export interface PaneMeta {
  cwd: string
  bootCommand?: string | undefined
  /** Projeto dono deste pane — usado pra achar/focar o pane de um projeto a partir da sidebar. */
  projectPath: string
  kind: PaneKind
}

interface PaneStoreState {
  /** Projetos conhecidos (sidebar), indexados por rootPath. */
  projects: Record<string, ProjectInfo>
  /** Ordem de inserção na sidebar — estável, nunca reordena ao selecionar. */
  order: string[]
  /** Último projeto ativo antes de fechar (persistido no main) — só pra restaurar no boot. */
  lastActivePath: string | null
  /** Projetos fixados no topo da sidebar; o resto mantém a ordem de inserção. */
  pinned: string[]
  /** Pasta raiz varrida na abertura; `null` enquanto o usuário não escolher uma. */
  projectsRoot: string | null

  /** Canvas único e compartilhado: panes de projetos diferentes podem ficar lado a lado. */
  layout: MosaicNode<string> | null
  panes: Record<string, PaneMeta>
  focusedPaneId: string | null
  zoomedPaneId: string | null

  hydrateRecents: (data: RecentProjects) => void
  togglePin: (rootPath: string) => void
  /** Restaura layout e panes de uma sessão anterior; tem precedência sobre o auto-open. */
  hydrateSession: (snapshot: SessionSnapshot) => void
  /** Foca o pane do projeto se já existir no canvas; senão cria um (split do pane focado). */
  openProject: (info: ProjectInfo, bootCommand?: string) => void
  /** Cria um pane novo para o projeto (split do focado) e devolve o id criado. */
  addPane: (projectPath: string, kind: PaneKind, bootCommand?: string) => string
  setLayout: (layout: MosaicNode<string> | null) => void
  splitFocused: (direction: MosaicDirection) => void
  closePane: (paneId: string) => void
  focusPane: (paneId: string) => void
  focusByIndex: (index: number) => void
  toggleZoom: (paneId: string) => void
}

function killAndRelease(paneId: string): void {
  const ptyId = getPtyId(paneId)
  if (ptyId) void window.hub.pty.kill(ptyId)
  releaseTerminal(paneId)
}

/** Substitui a folha `focusedId` por um split contendo `focusedId` e `newId`. */
function splitLeaf(
  layout: MosaicNode<string>,
  focusedId: string,
  direction: MosaicDirection,
  newId: string
): MosaicNode<string> | null {
  const path = findPanePath(layout, focusedId)
  if (!path) return null
  const newNode: MosaicNode<string> = {
    type: 'split',
    direction,
    children: [focusedId, newId],
    splitPercentages: [50, 50]
  }
  return updateTree(layout, [{ path, spec: { $set: newNode } }])
}

export const usePaneStore = create<PaneStoreState>((set, get) => ({
  projects: {},
  order: [],
  lastActivePath: null,
  pinned: [],
  projectsRoot: null,
  layout: null,
  panes: {},
  focusedPaneId: null,
  zoomedPaneId: null,

  hydrateRecents: ({ projects, lastActivePath, pinned, projectsRoot }): void => {
    const byPath: Record<string, ProjectInfo> = {}
    for (const info of projects) byPath[info.rootPath] = info
    const order = projects.map((info) => info.rootPath)
    set({ projects: byPath, order, lastActivePath, pinned, projectsRoot })
  },

  togglePin: (rootPath): void => {
    void window.hub.project.togglePin(rootPath).then((pinned) => set({ pinned }))
  },

  hydrateSession: ({ layout, panes, focusedPaneId, zoomedPaneId }): void => {
    set({
      layout: layout as MosaicNode<string> | null,
      panes,
      focusedPaneId,
      zoomedPaneId
    })
  },

  openProject: (info, bootCommand): void => {
    window.hub.project.setActive(info.rootPath)
    const { panes, layout, focusedPaneId, projects, order } = get()
    const newProjects = { ...projects, [info.rootPath]: info }
    const newOrder = order.includes(info.rootPath) ? order : [...order, info.rootPath]

    const existingPaneId = Object.keys(panes).find((id) => panes[id]?.projectPath === info.rootPath)
    if (existingPaneId) {
      set({ projects: newProjects, order: newOrder, focusedPaneId: existingPaneId })
      return
    }

    const newPaneId = crypto.randomUUID()
    const newMeta: PaneMeta = {
      cwd: info.rootPath,
      bootCommand,
      projectPath: info.rootPath,
      kind: 'terminal'
    }

    if (!layout || !focusedPaneId) {
      set({
        projects: newProjects,
        order: newOrder,
        layout: newPaneId,
        panes: { [newPaneId]: newMeta },
        focusedPaneId: newPaneId
      })
      return
    }

    const newLayout = splitLeaf(layout, focusedPaneId, 'row', newPaneId)
    if (!newLayout) return
    set({
      projects: newProjects,
      order: newOrder,
      layout: newLayout,
      panes: { ...panes, [newPaneId]: newMeta },
      focusedPaneId: newPaneId
    })
  },

  addPane: (projectPath, kind, bootCommand): string => {
    const { panes, layout, focusedPaneId } = get()
    const newPaneId = crypto.randomUUID()
    const meta: PaneMeta = { cwd: projectPath, bootCommand, projectPath, kind }

    if (!layout || !focusedPaneId) {
      set({ layout: newPaneId, panes: { ...panes, [newPaneId]: meta }, focusedPaneId: newPaneId })
      return newPaneId
    }

    const newLayout = splitLeaf(layout, focusedPaneId, 'row', newPaneId)
    if (!newLayout) return focusedPaneId
    set({
      layout: newLayout,
      panes: { ...panes, [newPaneId]: meta },
      focusedPaneId: newPaneId
    })
    return newPaneId
  },

  setLayout: (layout): void => set({ layout }),

  splitFocused: (direction): void => {
    const { layout, panes, focusedPaneId } = get()
    if (!layout || !focusedPaneId) return
    const focusedMeta = panes[focusedPaneId]
    if (!focusedMeta) return
    const newPaneId = crypto.randomUUID()
    const newLayout = splitLeaf(layout, focusedPaneId, direction, newPaneId)
    if (!newLayout) return
    set({
      layout: newLayout,
      panes: {
        ...panes,
        [newPaneId]: {
          cwd: focusedMeta.cwd,
          projectPath: focusedMeta.projectPath,
          kind: 'terminal'
        }
      },
      focusedPaneId: newPaneId
    })
  },

  closePane: (paneId): void => {
    const { layout, panes, focusedPaneId, zoomedPaneId } = get()
    if (!layout) return
    const path = findPanePath(layout, paneId)
    // path === [] significa que paneId é a raiz inteira: é o último pane, não fecha.
    if (!path || path.length === 0) return

    killAndRelease(paneId)
    const newLayout = updateTree(layout, [createRemoveUpdate(layout, path)])
    const restPanes = { ...panes }
    delete restPanes[paneId]
    const leaves = getLeaves(newLayout)
    set({
      layout: newLayout,
      panes: restPanes,
      focusedPaneId: focusedPaneId === paneId ? (leaves[0] ?? null) : focusedPaneId,
      zoomedPaneId: zoomedPaneId === paneId ? null : zoomedPaneId
    })
  },

  focusPane: (paneId): void => set({ focusedPaneId: paneId }),

  focusByIndex: (index): void => {
    const leaves = getLeaves(get().layout)
    const paneId = leaves[index]
    if (paneId) set({ focusedPaneId: paneId })
  },

  toggleZoom: (paneId): void =>
    set((state) => ({ zoomedPaneId: state.zoomedPaneId === paneId ? null : paneId }))
}))
