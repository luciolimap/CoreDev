import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { SESSION_VERSION, type SessionSnapshot } from '../shared/ipc'

/**
 * Persistência da sessão em JSON no `userData`.
 *
 * O ROADMAP §3.4 pedia `better-sqlite3`; revogado em
 * `decisions/2026-09-28-persistencia-em-json.md` — um usuário, uma janela e
 * alguns kilobytes não pagam um módulo nativo a mais para rebuildar.
 *
 * O diretório vem por argumento em vez de `app.getPath('userData')` para que
 * estas funções rodem no vitest sem stub do módulo `electron`.
 */

const SESSION_FILE = 'session.json'

function sessionPath(dir: string): string {
  return join(dir, SESSION_FILE)
}

/** Snapshot ausente, ilegível ou de outra versão devolve `null` — nunca lança. */
export function loadSession(dir: string): SessionSnapshot | null {
  try {
    const parsed = JSON.parse(readFileSync(sessionPath(dir), 'utf-8')) as Partial<SessionSnapshot>
    if (parsed.version !== SESSION_VERSION) return null
    if (!parsed.panes || typeof parsed.panes !== 'object') return null
    return {
      version: parsed.version,
      layout: parsed.layout ?? null,
      panes: parsed.panes,
      focusedPaneId: parsed.focusedPaneId ?? null,
      zoomedPaneId: parsed.zoomedPaneId ?? null
    }
  } catch {
    return null
  }
}

/**
 * Escrita atômica: o autosave dispara junto com o fechamento da janela, e um
 * `session.json` cortado pela metade custaria o layout inteiro do usuário.
 */
export function saveSession(dir: string, snapshot: SessionSnapshot): void {
  mkdirSync(dir, { recursive: true })
  const target = sessionPath(dir)
  const temp = `${target}.tmp`
  writeFileSync(temp, JSON.stringify(snapshot, null, 2), 'utf-8')
  renameSync(temp, target)
}

export function clearSession(dir: string): void {
  const target = sessionPath(dir)
  if (existsSync(target)) unlinkSync(target)
}

/**
 * Scrollback por pane, um arquivo por pane.
 *
 * Fica fora do `session.json` de propósito: o layout é gravado a cada meio
 * segundo e o scrollback só a cada 15 s — juntos, o arquivo pequeno pagaria o
 * preço de serializar centenas de kilobytes a cada arrastada de painel.
 */
const SCROLLBACK_DIR = 'scrollback'
const SCROLLBACK_CAP_BYTES = 256 * 1024

function scrollbackPath(dir: string, paneId: string): string {
  return join(dir, SCROLLBACK_DIR, `${encodeURIComponent(paneId)}.txt`)
}

export function saveScrollback(dir: string, paneId: string, data: string): void {
  mkdirSync(join(dir, SCROLLBACK_DIR), { recursive: true })
  writeFileSync(scrollbackPath(dir, paneId), capScrollback(trimTrailingBlankLines(data)), 'utf-8')
}

/**
 * O dump do `SerializeAddon` inclui a viewport inteira, linhas vazias e tudo.
 * Sem podar, a sessão restaurada aparece com um bloco em branco entre o último
 * comando e o separador — do tamanho do que sobrava de tela.
 */
export function trimTrailingBlankLines(data: string): string {
  return data.replace(/(?:[ \t]*\r?\n)+$/, '')
}

/**
 * Corta o começo, não o fim: o que interessa ao retomar é o que aconteceu por
 * último. O corte anda até o próximo início de sequência de escape — cair no
 * meio de um `ESC[38;2;R;G;Bm` faria o xterm comer o texto seguinte como
 * parâmetro e o topo do scrollback restaurado sairia corrompido.
 */
export function capScrollback(data: string): string {
  if (data.length <= SCROLLBACK_CAP_BYTES) return data
  const tail = data.slice(-SCROLLBACK_CAP_BYTES)
  const firstEscape = tail.indexOf('')
  return firstEscape === -1 ? tail : tail.slice(firstEscape)
}

export function loadScrollback(dir: string, paneId: string): string | null {
  try {
    return readFileSync(scrollbackPath(dir, paneId), 'utf-8')
  } catch {
    return null
  }
}

/** Apaga o scrollback de panes que não existem mais, senão o diretório cresce para sempre. */
export function pruneScrollback(dir: string, livePaneIds: string[]): void {
  const scrollbackDir = join(dir, SCROLLBACK_DIR)
  if (!existsSync(scrollbackDir)) return
  const live = new Set(livePaneIds.map((id) => `${encodeURIComponent(id)}.txt`))
  for (const file of readdirSync(scrollbackDir)) {
    if (!live.has(file)) unlinkSync(join(scrollbackDir, file))
  }
}
