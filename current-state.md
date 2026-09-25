# Estado atual — coredev

Atualizado: 2026-09-25

<!-- Fotografia, não diário: reescreva o que mudou. Cada frente em 3 a 5 linhas, com o link da spec. -->

## Agora

- Fase 0, 1, 2 (v1) e uma primeira versão da Fase 3 concluídas. Sidebar lista os projetos já
  abertos (ordem estável de inserção, sem reordenar ao clicar); cada projeto tem seu terminal com
  `claude` já rodando. O canvas é único e compartilhado: panes de projetos diferentes convivem lado
  a lado via `react-mosaic-component` (split horizontal/vertical, fechar, zoom
  `Ctrl/Cmd+Shift+Enter`, foco por `Ctrl/Cmd+1..9`), e trocar de foco não mata o pty dos outros —
  cada terminal continua rodando em segundo plano (`terminalRegistry.ts`, DOM órfão reparentável).
- Corrigido bug de digitação: o addon WebGL do xterm.js causava corrupção visual (glifo/cursor
  errado logo após o foco); desativado, renderer canvas padrão no lugar.
- Workspace migrado para o padrão `workspace-standard`.

## Frentes abertas

- Sidebar ainda sem "fixar no topo" (pedido explícito, adiado).
- Próximas fases do `ROADMAP.md`: Fase 4 (SessionStore/SQLite — hoje só `prefs.json` com lista de
  projetos recentes), Fase 6 (GitHubService).

## Próximo passo

- Retomar a implementação a partir da Fase 4 do `ROADMAP.md`, ou seguir polindo a Fase 3
  (fixar projeto na sidebar, arrastar painel entre projetos) se preferir fechar essa frente antes.
