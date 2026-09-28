import { SESSION_VERSION, type LayoutNode, type SessionSnapshot } from '../../../shared/ipc'
import { getTrackedCwd, paneIds, serializePane, setCwdByPtyId } from '../terminal/terminalRegistry'
import { usePaneStore } from './paneStore'

/**
 * Autosave do layout. Debounce curto porque o custo é um JSON minúsculo, e o
 * que se perde num crash é meio segundo de arrastar painel.
 *
 * O `before-quit` do main não serve aqui: ele não consegue esperar um round
 * trip até o renderer. O `beforeunload` da janela roda antes e é síncrono.
 */
const SAVE_DEBOUNCE_MS = 500

// ponytail: intervalo fixo. Serializar o buffer de cada pane custa bem mais que
// gravar o layout; só vale medir e afinar se o app passar a viver com dezenas de panes.
const SCROLLBACK_SAVE_INTERVAL_MS = 15_000

let timer: ReturnType<typeof setTimeout> | null = null

function currentSnapshot(): SessionSnapshot {
  const { layout, panes, focusedPaneId, zoomedPaneId } = usePaneStore.getState()
  // O `cwd` salvo é o rastreado por OSC 7, não o do spawn: o usuário fecha o app
  // no subdiretório em que estava trabalhando, não na raiz do projeto.
  const panesWithCwd: typeof panes = {}
  for (const [paneId, meta] of Object.entries(panes)) {
    const tracked = getTrackedCwd(paneId)
    panesWithCwd[paneId] = tracked ? { ...meta, cwd: tracked } : meta
  }
  return {
    version: SESSION_VERSION,
    layout: (layout ?? null) as LayoutNode | null,
    panes: panesWithCwd,
    focusedPaneId,
    zoomedPaneId
  }
}

function saveAllScrollback(): void {
  for (const paneId of paneIds()) {
    const data = serializePane(paneId)
    if (data) window.hub.session.saveScrollback(paneId, data)
  }
}

export function flushSession(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  window.hub.session.save(currentSnapshot())
  saveAllScrollback()
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
  const unsubscribeCwd = window.hub.pty.onCwd(({ ptyId, cwd }) => setCwdByPtyId(ptyId, cwd))
  const scrollbackTimer = setInterval(saveAllScrollback, SCROLLBACK_SAVE_INTERVAL_MS)
  window.addEventListener('beforeunload', flushSession)
  return () => {
    unsubscribe()
    unsubscribeCwd()
    clearInterval(scrollbackTimer)
    window.removeEventListener('beforeunload', flushSession)
  }
}
