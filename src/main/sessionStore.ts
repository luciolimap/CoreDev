import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
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
