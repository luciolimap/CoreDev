import { execFileSync } from 'child_process'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { app } from 'electron'
import type { ClaudeBinaryStatus, ProjectInfo } from '../shared/ipc'

const PREFS_PATH = join(app.getPath('userData'), 'prefs.json')

interface Prefs {
  lastProjectPath?: string
}

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

export function getLastProjectPath(): string | null {
  return readPrefs().lastProjectPath ?? null
}

export function setLastProjectPath(rootPath: string): void {
  writePrefs({ ...readPrefs(), lastProjectPath: rootPath })
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
