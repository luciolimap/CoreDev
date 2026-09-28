import { readdirSync, type Dirent } from 'fs'
import { join } from 'path'

/**
 * Descoberta de projetos na pasta raiz. Mora fora do `projectService` porque
 * aquele importa `electron` no topo e não roda no vitest.
 */

/** Diretório de ferramenta, não de projeto: aparecer na sidebar seria só ruído. */
const IGNORED = new Set([
  'node_modules',
  'venv',
  '.venv',
  '__pycache__',
  'dist',
  'build',
  'out',
  'target',
  'vendor'
])

/**
 * Subdiretórios de primeiro nível da raiz, em ordem alfabética. Só o primeiro
 * nível: descer recursivamente transformaria cada `src/` num projeto.
 */
export function discoverProjectPaths(root: string): string[] {
  let entries: Dirent[]
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    // Raiz apagada ou sem permissão: sem projetos descobertos, sem erro.
    return []
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('.') && !IGNORED.has(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => join(root, name))
}
