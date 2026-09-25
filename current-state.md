# Estado atual — coredev

Atualizado: 2026-09-25

<!-- Fotografia, não diário: reescreva o que mudou. Cada frente em 3 a 5 linhas, com o link da spec. -->

## Agora

- Fase 0, Fase 1 e uma primeira versão da Fase 2 (Claude Code integrado) concluídas. Selecionar a
  pasta do projeto já detecta o repo (`gh_owner`/`gh_repo`), lembra o último projeto aberto e o
  terminal sobe automaticamente rodando `claude` no diretório certo (sem botão manual). Sem binário
  `claude` no PATH, mostra aviso com link de instalação em vez de travar.
- Workspace migrado para o padrão `workspace-standard`.

## Frentes abertas

- Seção de seleção/troca de projeto marcada para "re-polir" depois (UI ainda crua, é v1).
- Próximas fases do `ROADMAP.md`: Fase 3 (abas e split view), Fase 4 (SessionStore/SQLite), Fase 6
  (GitHubService).

## Próximo passo

- Retomar a implementação a partir da Fase 3 do `ROADMAP.md`, ou polir a UI da Fase 2 se preferir
  fechar essa frente primeiro.
