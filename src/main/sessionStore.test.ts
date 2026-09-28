import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { SESSION_VERSION, type SessionSnapshot } from '../shared/ipc'
import {
  capScrollback,
  loadScrollback,
  loadSession,
  pruneScrollback,
  saveScrollback,
  saveSession
} from './sessionStore'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'coredev-session-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const snapshot: SessionSnapshot = {
  version: SESSION_VERSION,
  layout: {
    type: 'split',
    direction: 'row',
    children: ['a', 'b'],
    splitPercentages: [50, 50]
  },
  panes: {
    a: { cwd: '/tmp/a', projectPath: '/tmp/a', kind: 'terminal', bootCommand: 'claude' },
    b: { cwd: '/tmp/b', projectPath: '/tmp/b', kind: 'github' }
  },
  focusedPaneId: 'a',
  zoomedPaneId: null
}

test('grava e relê um snapshot sem perder nada', () => {
  saveSession(dir, snapshot)
  expect(loadSession(dir)).toEqual(snapshot)
})

test('sessão ausente devolve null', () => {
  expect(loadSession(dir)).toBeNull()
})

test('JSON corrompido devolve null em vez de lançar', () => {
  writeFileSync(join(dir, 'session.json'), '{"version": 1, "panes"', 'utf-8')
  expect(loadSession(dir)).toBeNull()
})

test('snapshot de outra versão é descartado', () => {
  saveSession(dir, { ...snapshot, version: SESSION_VERSION + 1 })
  expect(loadSession(dir)).toBeNull()
})

test('scrollback acima do cap guarda o fim, nao o comeco', () => {
  const data = 'x'.repeat(300 * 1024) + 'FIM'
  saveScrollback(dir, 'pane-1', data)
  const read = loadScrollback(dir, 'pane-1')
  expect(read?.endsWith('FIM')).toBe(true)
  expect(read?.length).toBe(256 * 1024)
})

test('scrollback de pane inexistente devolve null', () => {
  expect(loadScrollback(dir, 'nao-existe')).toBeNull()
})

test('prune apaga so o scrollback de panes que sairam do layout', () => {
  saveScrollback(dir, 'vivo', 'a')
  saveScrollback(dir, 'morto', 'b')
  pruneScrollback(dir, ['vivo'])
  expect(loadScrollback(dir, 'vivo')).toBe('a')
  expect(loadScrollback(dir, 'morto')).toBeNull()
})

test('paneId com caracteres de caminho nao escapa do diretorio', () => {
  saveScrollback(dir, '../fuga', 'a')
  expect(loadScrollback(dir, '../fuga')).toBe('a')
  expect(existsSync(join(dir, '..', 'fuga.txt'))).toBe(false)
})

test('o corte anda ate o proximo escape para nao partir uma sequencia ANSI', () => {
  const escape = String.fromCharCode(27)
  const head = 'x'.repeat(256 * 1024)
  const cut = capScrollback(head + escape + '[31mvermelho')
  expect(cut.startsWith(escape + '[31m')).toBe(true)
})

test('scrollback sem escape nenhum e cortado pelo tamanho', () => {
  expect(capScrollback('y'.repeat(300 * 1024)).length).toBe(256 * 1024)
})
