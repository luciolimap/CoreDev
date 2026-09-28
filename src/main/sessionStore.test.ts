import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { SESSION_VERSION, type SessionSnapshot } from '../shared/ipc'
import { loadSession, saveSession } from './sessionStore'

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
