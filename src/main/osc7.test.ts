import { expect, test } from 'vitest'
import { parseOsc7Cwd } from './osc7'

test('caminho unix com terminador BEL', () => {
  expect(parseOsc7Cwd('\x1b]7;file://maquina/home/lucio/dev\x07')).toBe('/home/lucio/dev')
})

test('caminho windows perde a barra inicial', () => {
  expect(parseOsc7Cwd('\x1b]7;file://PC/C:/dev/coredev\x07')).toBe('C:/dev/coredev')
})

test('terminador ST tambem vale', () => {
  expect(parseOsc7Cwd('\x1b]7;file:///home/lucio\x1b\\')).toBe('/home/lucio')
})

test('espaco vem percent-encoded', () => {
  expect(parseOsc7Cwd('\x1b]7;file:///home/meu%20projeto\x07')).toBe('/home/meu projeto')
})

test('o ultimo cwd do frame vence', () => {
  const chunk = '\x1b]7;file:///a\x07saida\x1b]7;file:///b\x07'
  expect(parseOsc7Cwd(chunk)).toBe('/b')
})

test('saida sem OSC 7 devolve null', () => {
  expect(parseOsc7Cwd('total 8\r\ndrwxr-xr-x 2 lucio\r\n')).toBeNull()
})

test('OSC de outro tipo nao e confundido com OSC 7', () => {
  expect(parseOsc7Cwd('\x1b]0;titulo da janela\x07')).toBeNull()
})
