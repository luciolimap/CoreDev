import { execFileSync } from 'child_process'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { app } from 'electron'
import type { ClaudeBinaryStatus, ProjectInfo } from '../shared/ipc'

const PREFS_PATH = join(app.getPath('userData'), 'prefs.json')

interface Prefs {
  /** Ordem estável de inserção — nunca reordenada ao selecionar; fixar só move para o topo. */
  recentProjects?: string[]
  /** Último projeto ativo, usado só pra restaurar o pane no boot (independe da ordem da sidebar). */
  lastActiveProject?: string
  /** Projetos fixados no topo da sidebar; a ordem de inserção dos demais não muda. */
  pinnedProjects?: string[]
}

const MAX_RECENT_PROJECTS = 20

function readPrefs(): Prefs {
  try {
    return JSON.parse(readFileSync(PREFS_PATH, 'utf-8')) as Prefs
  } catch {
    return {}
  }
}

function writePrefs(prefs: Prefs): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2), 'utf-8')
}

/** Ordem de inserção (não de uso); caminhos que não existem mais no disco ficam de fora. */
export function getRecentProjectPaths(): string[] {
  return (readPrefs().recentProjects ?? []).filter((p) => existsSync(p))
}

/** Acrescenta ao fim se ainda não estiver na lista; nunca reordena um já existente. */
export function addRecentProject(rootPath: string): void {
  const prefs = readPrefs()
  const existing = prefs.recentProjects ?? []
  if (existing.includes(rootPath)) return
  writePrefs({ ...prefs, recentProjects: [...existing, rootPath].slice(-MAX_RECENT_PROJECTS) })
}

export function getLastActiveProjectPath(): string | null {
  const path = readPrefs().lastActiveProject
  return path && existsSync(path) ? path : null
}

export function setLastActiveProjectPath(rootPath: string): void {
  writePrefs({ ...readPrefs(), lastActiveProject: rootPath })
}

export function getPinnedProjectPaths(): string[] {
  return (readPrefs().pinnedProjects ?? []).filter((p) => existsSync(p))
}

export function togglePinnedProject(rootPath: string): string[] {
  const prefs = readPrefs()
  const pinned = prefs.pinnedProjects ?? []
  const next = pinned.includes(rootPath)
    ? pinned.filter((p) => p !== rootPath)
    : [...pinned, rootPath]
  writePrefs({ ...prefs, pinnedProjects: next })
  return next
}

/** Parseia a URL do remote `origin` de um `.git/config` no formato INI. */
function parseOriginUrl(gitConfig: string): string | null {
  const lines = gitConfig.split('\n')
  let inOrigin = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('[')) {
      inOrigin = trimmed === '[remote "origin"]'
      continue
    }
    if (inOrigin && trimmed.startsWith('url')) {
      const [, value] = trimmed.split('=')
      return value?.trim() ?? null
    }
  }
  return null
}

/** Extrai owner/repo de URLs SSH (`git@github.com:owner/repo.git`) ou HTTPS. */
function parseGhOwnerRepo(remoteUrl: string): { ghOwner: string | null; ghRepo: string | null } {
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/)
  if (!match) return { ghOwner: null, ghRepo: null }
  return { ghOwner: match[1] ?? null, ghRepo: match[2] ?? null }
}

export function detectRepo(rootPath: string): ProjectInfo {
  const name = basename(rootPath)
  const gitConfigPath = join(rootPath, '.git', 'config')
  if (!existsSync(gitConfigPath)) {
    return { rootPath, name, ghOwner: null, ghRepo: null }
  }
  const remoteUrl = parseOriginUrl(readFileSync(gitConfigPath, 'utf-8'))
  if (!remoteUrl) return { rootPath, name, ghOwner: null, ghRepo: null }
  const { ghOwner, ghRepo } = parseGhOwnerRepo(remoteUrl)
  return { rootPath, name, ghOwner, ghRepo }
}

export function checkClaudeBinary(): ClaudeBinaryStatus {
  const finder = process.platform === 'win32' ? 'where' : 'which'
  try {
    const out = execFileSync(finder, ['claude'], { encoding: 'utf-8' })
    const path = out.split(/\r?\n/)[0]?.trim()
    return path ? { available: true, path } : { available: false, path: null }
  } catch {
    return { available: false, path: null }
  }
}
