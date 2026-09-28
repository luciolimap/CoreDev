import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { discoverProjectPaths } from './projectScan'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'coredev-scan-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function names(): string[] {
  return discoverProjectPaths(root).map((path) => basename(path))
}

test('cada subdiretorio vira um projeto, em ordem alfabetica', () => {
  mkdirSync(join(root, 'zulu'))
  mkdirSync(join(root, 'alfa'))
  expect(names()).toEqual(['alfa', 'zulu'])
})

test('arquivo solto nao vira projeto', () => {
  writeFileSync(join(root, 'notas.md'), 'x', 'utf-8')
  mkdirSync(join(root, 'projeto'))
  expect(names()).toEqual(['projeto'])
})

test('pasta oculta e diretorio de ferramenta ficam de fora', () => {
  mkdirSync(join(root, '.git'))
  mkdirSync(join(root, 'node_modules'))
  mkdirSync(join(root, 'dist'))
  mkdirSync(join(root, 'projeto'))
  expect(names()).toEqual(['projeto'])
})

test('so o primeiro nivel conta', () => {
  mkdirSync(join(root, 'projeto', 'src'), { recursive: true })
  expect(names()).toEqual(['projeto'])
})

test('raiz inexistente devolve lista vazia em vez de lancar', () => {
  expect(discoverProjectPaths(join(root, 'nao-existe'))).toEqual([])
})
