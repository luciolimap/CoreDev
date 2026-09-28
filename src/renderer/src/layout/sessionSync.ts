import { SESSION_VERSION, type LayoutNode, type SessionSnapshot } from '../../../shared/ipc'
import { usePaneStore } from './paneStore'

/**
 * Autosave do layout. Debounce curto porque o custo é um JSON minúsculo, e o
 * que se perde num crash é meio segundo de arrastar painel.
 *
 * O `before-quit` do main não serve aqui: ele não consegue esperar um round
 * trip até o renderer. O `beforeunload` da janela roda antes e é síncrono.
 */
const SAVE_DEBOUNCE_MS = 500

let timer: ReturnType<typeof setTimeout> | null = null

function currentSnapshot(): SessionSnapshot {
  const { layout, panes, focusedPaneId, zoomedPaneId } = usePaneStore.getState()
  return {
    version: SESSION_VERSION,
    layout: (layout ?? null) as LayoutNode | null,
    panes,
    focusedPaneId,
    zoomedPaneId
  }
}

export function flushSession(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  window.hub.session.save(currentSnapshot())
}

/** Só pode ser chamado depois da restauração, senão o estado vazio do boot sobrescreve a sessão. */
export function startSessionSync(): () => void {
  const unsubscribe = usePaneStore.subscribe((state, prev) => {
    const unchanged =
      state.layout === prev.layout &&
      state.panes === prev.panes &&
      state.focusedPaneId === prev.focusedPaneId &&
      state.zoomedPaneId === prev.zoomedPaneId
    if (unchanged) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(flushSession, SAVE_DEBOUNCE_MS)
  })
  window.addEventListener('beforeunload', flushSession)
  return () => {
    unsubscribe()
    window.removeEventListener('beforeunload', flushSession)
  }
}
