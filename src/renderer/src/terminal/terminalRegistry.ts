import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'

/**
 * Registro de instâncias de terminal fora do ciclo de vida do React.
 *
 * O react-mosaic (Fase 3) desmonta e remonta componentes quando a árvore de
 * layout muda (arrastar um painel, por exemplo). Se a instância do xterm.js
 * vivesse dentro do componente React, isso destruiria o terminal a cada
 * drag. A solução é manter o <div> host do xterm.js num Map singleton, e o
 * componente React apenas o *reparenta* (appendChild/remove) — nunca recria.
 *
 * Ver ROADMAP.md §5.2 — "a peça de engenharia mais importante do app inteiro".
 */

interface TerminalEntry {
  term: Terminal
  fit: FitAddon
  search: SearchAddon
  el: HTMLDivElement
  ptyId: string | null
  spawnPromise: Promise<string> | null
}

const registry = new Map<string, TerminalEntry>()

export function acquireTerminal(paneId: string): TerminalEntry {
  let entry = registry.get(paneId)
  if (!entry) {
    const el = document.createElement('div')
    el.className = 'xterm-host'
    el.style.width = '100%'
    el.style.height = '100%'

    const term = new Terminal({
      fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
      fontSize: 13,
      scrollback: 10_000,
      allowProposedApi: true,
      theme: {
        background: '#12141a',
        foreground: '#e4e6eb'
      }
    })

    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    term.loadAddon(new WebLinksAddon())

    term.open(el) // abre no elemento órfão, ainda sem pai no DOM real

    try {
      term.loadAddon(new WebglAddon())
    } catch {
      // sem WebGL disponível (ou contexto perdido): segue no renderer canvas padrão
    }

    entry = { term, fit, search, el, ptyId: null, spawnPromise: null }
    registry.set(paneId, entry)
  }
  return entry
}

export function releaseTerminal(paneId: string): void {
  const entry = registry.get(paneId)
  if (!entry) return
  entry.term.dispose()
  registry.delete(paneId)
}

export function getPtyId(paneId: string): string | null {
  return registry.get(paneId)?.ptyId ?? null
}

export function setPtyId(paneId: string, ptyId: string | null): void {
  const entry = registry.get(paneId)
  if (entry) entry.ptyId = ptyId
}

/**
 * Deduplica o spawn: se duas montagens concorrentes do mesmo paneId pedirem
 * spawn (ex: o duplo-efeito do React.StrictMode em dev), ambas compartilham
 * a mesma promise em vez de criar dois ptys — evita ter que matar um pty
 * recém-criado por uma corrida, o que por sua vez evita um bug conhecido do
 * node-pty no processo auxiliar de kill no Windows (AttachConsole failed).
 */
export function ensureSpawned(
  paneId: string,
  spawn: () => Promise<{ ptyId: string }>
): Promise<string> {
  const entry = registry.get(paneId)
  if (!entry) throw new Error(`acquireTerminal precisa ser chamado antes para paneId=${paneId}`)
  if (entry.ptyId) return Promise.resolve(entry.ptyId)
  if (!entry.spawnPromise) {
    entry.spawnPromise = spawn()
      .then((res) => {
        entry.ptyId = res.ptyId
        return res.ptyId
      })
      .finally(() => {
        entry.spawnPromise = null
      })
  }
  return entry.spawnPromise
}
