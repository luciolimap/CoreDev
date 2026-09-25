# coredev

<!-- Fonte única de instrução para qualquer agente; o CLAUDE.md só importa este arquivo.
     Com o current-state.md, no máximo 200 linhas ou 25 KB: o que não cabe vira ponteiro. -->

Hub desktop para devs (Electron + React + TypeScript + Vite): Claude Code, GitHub e terminal
numa única janela, com sessão persistente por projeto. Cliente: uso pessoal do Lucio.

## Como verificar

- Workspace no padrão: `python3 C:/dev/workspace-standard/workspace.py check .`
- App abre e builda: `npm run typecheck && npm run dev`
- Testes: `npm test`

## Fontes

| Preciso de | Onde está |
|---|---|
| estado atual | `current-state.md` |
| por que algo é assim | `decisions/`, um arquivo por decisão; busque pelo nome |
| trabalho em andamento | `specs/`; as fechadas ficam em `specs/arquivo/` |
| histórico | `session-log.md`, uma linha por sessão com link para a spec |
| código | esta mesma pasta (workspace e repo são o mesmo diretório) |
| arquitetura e roadmap completo | `ROADMAP.md` |
| credenciais | `secrets/<sistema>.local.json`, lidas por script |

Não é fonte: conversa sem registro aqui, export antigo, URL temporária.

## Limites

- Sempre: rodar `npm run typecheck` antes de considerar uma mudança pronta (2026-09-25: padrão adotado na criação do workspace)
- Nunca: abrir `secrets/` sem a tarefa pedir o valor, nem copiar credencial para `.md`, log ou chat (padrão)

## Skills

Em `.agents/skills/<nome>/SKILL.md`. O Claude as vê por `.claude/skills`, criada pelo `workspace.py link`.

| Skill | Quando usar |
|---|---|

## Ao fechar a sessão

1. Reescreva o `current-state.md` com o que vale agora; o que aconteceu não entra lá.
2. Uma linha no topo do `session-log.md`: `AAAA-MM-DD — o que foi feito — specs/<arquivo>.md`.
3. Decisão durável vira arquivo novo em `decisions/`; a revogada ganha `Status: revogada por <arquivo>`.
4. Receita que se repetiu vira skill.
5. Marque `a confirmar` o que não foi verificado nesta sessão.
