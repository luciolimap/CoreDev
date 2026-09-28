# Estado atual — coredev

Atualizado: 2026-09-28

<!-- Fotografia, não diário: reescreva o que mudou. Cada frente em 3 a 5 linhas, com o link da spec. -->

## Agora

- Fases 0 a 6 do `ROADMAP.md` concluídas, e a Fase 7 em parte. O app cumpre a promessa
  central: fecha no meio de uma sessão e reabre com o mesmo layout, o mesmo scrollback, o
  mesmo `cwd` e o `claude` rodando de novo. Spec: `specs/2026-09-28-fases-4-a-7.md`.
- Persistência em JSON no `userData` (`session.json` + `scrollback/<paneId>.txt`), não em
  SQLite — ver `decisions/2026-09-28-persistencia-em-json.md`. Autosave do layout com
  debounce de 500 ms; scrollback a cada 15 s e no `beforeunload`.
- `cwd` rastreado por OSC 7 (`src/main/osc7.ts`); sem OSC 7 no shell, vale o `cwd` do spawn.
  `cwd` que sumiu do disco cai no diretório do projeto e depois no home, com aviso no terminal.
  O `bootCommand` sai por quiescência da saída do shell (250 ms de silêncio, teto de 3 s).
- Painel de GitHub pelo `gh` CLI (PRs com status de CI, issues, checkout no terminal do
  projeto) — ver `decisions/2026-09-28-github-pelo-gh-cli.md`. Sem device flow, sem token
  guardado, sem Octokit.
- Paleta de comandos em `Ctrl/Cmd+K` e fixar projeto no topo da sidebar.
- Descoberta automática de projetos: escolhida uma pasta raiz (⌂ na sidebar), todo
  subdiretório de primeiro nível dela vira projeto, recalculado a cada abertura do app.
  Criar projeto pelo próprio app (✳) usa o diálogo nativo de salvar.
  Spec: `specs/2026-09-28-descoberta-de-projetos.md`.

## Frentes abertas

- Revisão de defeitos rodada em 2026-09-28: 9 achados, 8 corrigidos. Fica em aberto o (c) do
  achado sobre `cwdByPane`: um evento `pty:cwd` que chegue antes de o renderer registrar o
  `ptyId` do spawn é descartado em silêncio.
- Aceite manual das fases 4 a 7 ainda não rodado ponta a ponta (a confirmar):
  `specs/2026-09-28-fases-4-a-7.md`.
- Fase 7 incompleta de propósito: sem assinatura de código, sem auto-update, sem tela de
  preferências, sem export/import de configuração. As duas primeiras exigem certificado
  Authenticode e conta Apple paga.
- Arrastar painel entre projetos continua fora.

## Próximo passo

- Rodar o aceite da spec das fases 4 a 7 e corrigir o que aparecer.
- Depois: tela de preferências e export/import de configuração, ou assinatura de código
  quando houver certificado.
