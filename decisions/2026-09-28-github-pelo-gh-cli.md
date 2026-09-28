# GitHub pelo `gh` CLI, não por OAuth device flow com Octokit

Data: 2026-09-28
Status: vigente
Revoga: ROADMAP.md §6 (device flow, `safeStorage` + tabela `credential`, Octokit com
plugins de throttling e retry, `gh_cache` com ETag) e o risco R7

## Contexto

A fase 6 pedia autenticação própria por device flow, token guardado com `safeStorage`,
Octokit no main e um cache com ETag e stale-while-revalidate.

## Decisão

O painel de GitHub chama o `gh` CLI com `execFile` (nunca por shell) e `--json`:
`gh pr list` e `gh issue list` para ler, `gh pr checkout` escrito no terminal do projeto
para agir. O app não guarda credencial nenhuma.

## Por quê

- O `gh` já resolve autenticação, refresh de token, `slow_down` do device flow, rate limit
  e proxy corporativo. Reimplementar isso produz um token nosso para vazar e um limite
  nosso para estourar, sem nenhum comportamento novo para o usuário.
- O ROADMAP §7 já define que o GitHub é opcional e preguiçoso: o app abre e funciona sem
  ele. Uma dependência externa opcional cabe nessa moldura; o que não cabe é um subsistema
  de credenciais no caminho crítico.
- `safeStorage` indisponível no Linux (risco R5) deixa de ser um problema nosso: não há
  segredo a guardar.

## Custo aceito

- Exige `gh` instalado e autenticado. A ausência de cada um é um erro distinto e acionável
  na UI (`missing` leva ao instalador, `unauthenticated` manda rodar `gh auth login`),
  nunca um painel vazio e mudo.
- Um processo por consulta em vez de uma conexão HTTP reaproveitada. Para uma lista de
  PRs atualizada sob demanda, o custo não aparece.
- Ações de escrita continuam fora de escopo; quando entrarem, o `gh` também as cobre.
