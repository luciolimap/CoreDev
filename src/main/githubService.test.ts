import { expect, test } from 'vitest'
import { classifyGhError, parseIssues, parsePullRequests, rollupCiStatus } from './githubService'

test('lista vazia de PRs nao quebra', () => {
  expect(parsePullRequests('[]')).toEqual([])
})

test('PR sem autor cai num rotulo em vez de undefined', () => {
  const stdout = JSON.stringify([
    { number: 7, title: 'Corrige o pty', headRefName: 'fix/pty', statusCheckRollup: null }
  ])
  expect(parsePullRequests(stdout)).toEqual([
    { number: 7, title: 'Corrige o pty', author: 'desconhecido', headRefName: 'fix/pty', ci: 'none' }
  ])
})

test('reprovado domina pendente e aprovado', () => {
  expect(
    rollupCiStatus([{ conclusion: 'SUCCESS' }, { state: 'PENDING' }, { conclusion: 'FAILURE' }])
  ).toBe('failure')
})

test('pendente domina aprovado', () => {
  expect(rollupCiStatus([{ conclusion: 'SUCCESS' }, { status: 'IN_PROGRESS' }])).toBe('pending')
})

test('sem check nenhum e none, nao success', () => {
  expect(rollupCiStatus([])).toBe('none')
  expect(rollupCiStatus(null)).toBe('none')
})

test('issue sem label vira lista vazia', () => {
  const stdout = JSON.stringify([{ number: 3, title: 'Lentidao', author: { login: 'lucio' } }])
  expect(parseIssues(stdout)).toEqual([
    { number: 3, title: 'Lentidao', author: 'lucio', labels: [] }
  ])
})

test('gh ausente e gh deslogado sao erros diferentes', () => {
  expect(classifyGhError({ code: 'ENOENT' }).reason).toBe('missing')
  expect(classifyGhError({ stderr: 'gh auth login required' }).reason).toBe('unauthenticated')
  expect(classifyGhError({ stderr: 'repository not found' }).reason).toBe('failed')
})
