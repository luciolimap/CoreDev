# Adotar o workspace-standard

Data: 2026-09-25
Status: ativa

## Contexto

O projeto CoreDev já tinha código e histórico git, mas nenhuma memória estruturada fora do
`ROADMAP.md`: nenhum registro de sessão, nenhuma decisão datada, nada verificável por comando.

## Decisão

Este workspace segue o `STANDARD.md` do repositório `workspace-standard` (clonado em
`C:/dev/workspace-standard`). Como o repositório de código já existe nesta mesma pasta, o
workspace e o `repo/` são o mesmo diretório — não há subpasta `repo/` separada.
`workspace.py check` mede a conformidade e roda sozinho no início de cada sessão do Claude.

## Consequências

`AGENTS.md` e `current-state.md` somam no máximo 200 linhas ou 25 KB. Decisão nova vira um
arquivo nesta pasta; decisão antiga não se edita, ganha `Status: revogada por <arquivo>`.
