import { execFile } from 'child_process'
import { promisify } from 'util'
import type { CiStatus, GhFailure, GhIssue, GhPullRequest, GhResult } from '../shared/ipc'

/**
 * GitHub pelo `gh` CLI, não por Octokit + device flow.
 *
 * Ver `decisions/2026-09-28-github-pelo-gh-cli.md`: o `gh` já trata
 * autenticação, refresh de token, rate limit e proxy corporativo. Reimplementar
 * isso renderia um token nosso para guardar e um limite nosso para estourar.
 */

const execFileAsync = promisify(execFile)
const LIST_LIMIT = 30

interface RawCheck {
  state?: string
  conclusion?: string
  status?: string
}

/**
 * O `statusCheckRollup` traz um item por check. Reprovado domina pendente, que
 * domina aprovado: o que o dev precisa ver primeiro é o que está quebrado.
 */
export function rollupCiStatus(checks: RawCheck[] | null | undefined): CiStatus {
  if (!checks || checks.length === 0) return 'none'
  const states = checks.map((check) =>
    (check.conclusion || check.state || check.status || '').toUpperCase()
  )
  if (states.some((state) => state === 'FAILURE' || state === 'ERROR' || state === 'TIMED_OUT')) {
    return 'failure'
  }
  if (states.some((state) => state === 'PENDING' || state === 'IN_PROGRESS' || state === 'QUEUED')) {
    return 'pending'
  }
  if (states.some((state) => state === 'SUCCESS' || state === 'COMPLETED')) return 'success'
  return 'none'
}

export function parsePullRequests(stdout: string): GhPullRequest[] {
  const raw = JSON.parse(stdout) as {
    number: number
    title: string
    author?: { login?: string }
    headRefName: string
    statusCheckRollup?: RawCheck[] | null
  }[]
  return raw.map((pr) => ({
    number: pr.number,
    title: pr.title,
    author: pr.author?.login ?? 'desconhecido',
    headRefName: pr.headRefName,
    ci: rollupCiStatus(pr.statusCheckRollup)
  }))
}

export function parseIssues(stdout: string): GhIssue[] {
  const raw = JSON.parse(stdout) as {
    number: number
    title: string
    author?: { login?: string }
    labels?: { name: string }[]
  }[]
  return raw.map((issue) => ({
    number: issue.number,
    title: issue.title,
    author: issue.author?.login ?? 'desconhecido',
    labels: (issue.labels ?? []).map((label) => label.name)
  }))
}

/** Separa "não tem gh" de "tem gh mas não está logado": a ação do usuário é outra. */
export function classifyGhError(error: unknown): GhFailure {
  const err = error as { code?: string; stderr?: string; message?: string }
  if (err.code === 'ENOENT') {
    return {
      ok: false,
      reason: 'missing',
      message: 'O GitHub CLI (`gh`) não está no PATH.'
    }
  }
  const stderr = err.stderr ?? err.message ?? ''
  if (/gh auth login|not logged into|authentication/i.test(stderr)) {
    return {
      ok: false,
      reason: 'unauthenticated',
      message: 'O `gh` não está autenticado. Rode `gh auth login` num terminal.'
    }
  }
  return { ok: false, reason: 'failed', message: stderr.trim() || 'Falha ao executar o `gh`.' }
}

async function runGh<T>(args: string[], parse: (stdout: string) => T[]): Promise<GhResult<T>> {
  try {
    // execFile, nunca shell: título de PR é entrada não confiável (ROADMAP R11).
    const { stdout } = await execFileAsync('gh', args, { maxBuffer: 8 * 1024 * 1024 })
    return { ok: true, items: parse(stdout) }
  } catch (error) {
    return classifyGhError(error)
  }
}

export function listPullRequests(repo: string): Promise<GhResult<GhPullRequest>> {
  return runGh(
    [
      'pr',
      'list',
      '--repo',
      repo,
      '--limit',
      String(LIST_LIMIT),
      '--json',
      'number,title,author,headRefName,statusCheckRollup'
    ],
    parsePullRequests
  )
}

export function listIssues(repo: string): Promise<GhResult<GhIssue>> {
  return runGh(
    ['issue', 'list', '--repo', repo, '--limit', String(LIST_LIMIT), '--json', 'number,title,author,labels'],
    parseIssues
  )
}
