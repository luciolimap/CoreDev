import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { SerializeAddon } from '@xterm/addon-serialize'

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
  serialize: SerializeAddon
  el: HTMLDivElement
  ptyId: string | null
  spawnPromise: Promise<string> | null
  /** O scrollback da sessão anterior só é escrito uma vez, no primeiro mount deste pane. */
  restored: boolean
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
    const serialize = new SerializeAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    term.loadAddon(serialize)
    term.loadAddon(new WebLinksAddon())

    term.open(el) // abre no elemento órfão, ainda sem pai no DOM real

    // WebglAddon desativado por ora: causava corrupção visual (glifo/cursor
    // em posição errada logo após foco) — renderer canvas padrão é mais lento
    // em saída volumosa, mas correto. Reavaliar na Fase 5 (R2 do ROADMAP).

    entry = { term, fit, search, serialize, el, ptyId: null, spawnPromise: null, restored: false }
    registry.set(paneId, entry)
  }
  return entry
}

export function releaseTerminal(paneId: string): void {
  const entry = registry.get(paneId)
  if (!entry) return
  entry.term.dispose()
  registry.delete(paneId)
  cwdByPane.delete(paneId)
}

export function getPtyId(paneId: string): string | null {
  return registry.get(paneId)?.ptyId ?? null
}

export function setPtyId(paneId: string, ptyId: string | null): void {
  const entry = registry.get(paneId)
  if (!entry) return
  entry.ptyId = ptyId
  // Pty novo começa sem cwd rastreado: herdar o do pty morto persistiria um
  // diretório onde o shell não está — e o powershell.exe nem emite OSC 7.
  if (ptyId === null) cwdByPane.delete(paneId)
}

/**
 * Foca a textarea interna do xterm.js explicitamente. Clicar num pane
 * também dispara `focusPane` (estado do zustand) no mesmo mousedown; sem
 * essa chamada explícita, a corrida entre o re-render disparado por esse
 * `set()` e o próprio listener de foco do xterm.js podia comer a primeira
 * tecla digitada (ela chegava antes da textarea estar de fato focada).
 */
export function focusTerminal(paneId: string): void {
  registry.get(paneId)?.term.focus()
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

/**
 * Marca o pane como já restaurado e diz se a restauração cabe agora. Remontagens
 * (arrastar painel, zoom) chamam `acquireTerminal` de novo; sem esta trava, o
 * scrollback da sessão anterior seria reescrito por cima da sessão em andamento.
 */
export function claimRestore(paneId: string): boolean {
  const entry = registry.get(paneId)
  if (!entry || entry.restored || entry.ptyId !== null) return false
  entry.restored = true
  return true
}

export function serializePane(paneId: string): string | null {
  return registry.get(paneId)?.serialize.serialize() ?? null
}

/**
 * `cwd` anunciado por OSC 7, indexado por pane. Mora aqui e não no store porque
 * muda a cada `cd` — um `set()` do zustand por linha de prompt re-renderizaria
 * o canvas inteiro à toa.
 */
const cwdByPane = new Map<string, string>()

export function setCwdByPtyId(ptyId: string, cwd: string): void {
  for (const [paneId, entry] of registry) {
    if (entry.ptyId === ptyId) {
      cwdByPane.set(paneId, cwd)
      return
    }
  }
}

export function getTrackedCwd(paneId: string): string | null {
  return cwdByPane.get(paneId) ?? null
}

export function paneIds(): string[] {
  return [...registry.keys()]
}
