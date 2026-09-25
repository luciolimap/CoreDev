# CoreDev — Roteiro de Desenvolvimento

> Documento de arquitetura e plano de implementação.
> Status: pré-implementação (fase 0 não iniciada).
> Stack fechada: Electron + React + TypeScript + Vite + node-pty + xterm.js + @octokit/rest.

---

## 1. Visão geral e proposta de valor

**O problema:** hoje o fluxo de trabalho do dev é fragmentado entre três janelas que nunca conversam — o terminal com o Claude Code rodando, o navegador aberto no GitHub do repo, e um segundo terminal pra rodar testes/build. Trocar de contexto custa caro, e toda vez que a máquina reinicia é preciso reconstruir manualmente todo esse setup: abrir terminal, `cd` no projeto certo, rodar `claude`, abrir o PR no navegador, abrir outro terminal.

**A proposta:** uma única janela desktop que é o *espaço de trabalho* do dev, não mais um agregador de abas. Um canvas com painéis divisíveis onde Claude Code, GitHub e shell coexistem lado a lado, amarrados por um conceito central: **o projeto ativo**. Abriu o projeto → o terminal já está no diretório certo, o Claude Code já subiu com contexto, o painel do GitHub já está apontando pro repositório daquele diretório.

**O diferencial real** não é "tudo numa janela" (isso o VS Code já faz razoavelmente). É **persistência de sessão de verdade**: você fecha o app no meio de uma conversa com o Claude Code e, ao reabrir, encontra o mesmo layout, o mesmo scrollback, o mesmo diretório, e o Claude Code já rodando de novo. O app é retomável, não reconfigurável.

**Escopo explícito de não-objetivos (MVP):** não é um editor de código (o dev continua usando VS Code/Neovim ao lado), não é um cliente Git com GUI de diff/merge, não reimplementa o Claude Code, não tem backend/servidor, não tem contas nem sincronização entre máquinas.

---

## 2. Nome e conceito visual

**Nome definido: `CoreDev`** (nome do pacote: `coredev`; o binário/comando: `coredev`). Nome já verificado como disponível pelo usuário — não é mais uma decisão em aberto.

**Conceito visual:** tema escuro por padrão, tipografia monoespaçada apenas dentro dos painéis de terminal e sans-serif (Inter) no chrome da aplicação — o contraste entre as duas famílias é o que separa visualmente "ferramenta" de "conteúdo". Sidebar esquerda estreita e fria (ícones + label), painéis com bordas de 1px e um *accent* de cor quente apenas no painel focado, de modo que o dev sempre saiba pra onde o teclado está indo. Zero cromo decorativo: cada pixel não-conteúdo é orçamento perdido num app que vive em tela cheia.

---

## 3. Arquitetura técnica

### 3.1 Topologia de processos

```
┌─────────────────────────────────────────────────────────────────────┐
│ MAIN PROCESS (Node.js completo)                                     │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │ PtyManager   │  │ SessionStore │  │ GitHubService          │   │
│  │              │  │              │  │                        │   │
│  │ Map<id, {    │  │ SQLite       │  │ @octokit/rest          │   │
│  │  pty,        │  │ (better-     │  │ + device flow OAuth    │   │
│  │  ring buffer │  │  sqlite3)    │  │ + cache em memória     │   │
│  │  cwd, cmd    │  │              │  │ + ETag conditional req │   │
│  │ }>           │  │ + safeStorage│  │                        │   │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬────────────┘   │
│         │                 │                       │                │
│  ┌──────┴─────────────────┴───────────────────────┴────────────┐  │
│  │ IPC Router  (ipcMain.handle / webContents.send)             │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
└─────────────────────────────┼─────────────────────────────────────┘
                              │ contextBridge (contextIsolation: true,
                              │ nodeIntegration: false, sandbox: true)
┌─────────────────────────────┼─────────────────────────────────────┐
│ PRELOAD (ponte mínima, sem lógica de negócio)                     │
│   window.hub = {                                                   │
│     pty:     { spawn, write, resize, kill, onData, onExit },       │
│     session: { load, save, patch },                                │
│     github:  { startAuth, pollAuth, listPRs, listIssues, ... },    │
│     project: { pickDirectory, detectRepo },                        │
│     app:     { onBeforeQuit, platform, version }                   │
│   }                                                                │
└─────────────────────────────┬─────────────────────────────────────┘
                              │
┌─────────────────────────────┼─────────────────────────────────────┐
│ RENDERER (React + TS + Vite, sem acesso a Node)                    │
│                                                                    │
│  App                                                               │
│   ├── Sidebar (lista de projetos + abas)                          │
│   ├── Toolbar (projeto ativo, botão "Claude Code", ações)         │
│   └── MosaicRoot  ← react-mosaic-component                         │
│        ├── TerminalPanel  (xterm.js + FitAddon + SearchAddon)      │
│        ├── GitHubPanel    (PRs / Issues / Branches / Notifs)       │
│        └── TerminalPanel  (segundo shell, livre)                   │
│                                                                    │
│  Estado: Zustand (store único, slices: projects/layout/pty/github) │
└────────────────────────────────────────────────────────────────────┘
```

### 3.2 Regra de ouro da divisão de responsabilidades

- **Main é o dono de tudo que tem estado de sistema operacional**: processos pty, arquivos, tokens, rede autenticada. O renderer nunca vê um file descriptor nem um token.
- **Renderer é o dono do que é apresentação e layout**, e é a única fonte de verdade do layout enquanto o app está vivo.
- **Preload não tem lógica.** É só tipagem + `ipcRenderer.invoke` embrulhado. Se aparecer um `if` de negócio no preload, está no lugar errado.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Sem exceções — isso é o que permite, lá na frente, abrir o app pra outros devs sem reescrever a camada de segurança.

### 3.3 Fluxo de dados do terminal (pty ↔ renderer)

O caminho crítico de performance do app inteiro. Um `ls -R` num monorepo grande produz megabytes em milissegundos; IPC ingênuo trava a UI.

**Spawn:**
1. Renderer monta um `<TerminalPanel paneId="t1">`, cria a instância do `xterm.js`, mede as dimensões com `FitAddon` e chama `window.hub.pty.spawn({ paneId, cwd, shell, cols, rows, initialCommand? })`.
2. Main cria o pty com `node-pty`:
   - Windows: `powershell.exe` via ConPTY (padrão do node-pty em Win10 1809+).
   - macOS/Linux: `$SHELL` do usuário, com `-l` (login shell) para carregar PATH completo — essencial, senão o binário `claude` frequentemente não é encontrado.
3. Main registra no `PtyManager`: `{ pty, paneId, cwd, ringBuffer, cmd }`.
4. Main devolve o `ptyId` real. O renderer guarda o par `paneId ↔ ptyId`.

**Fluxo de saída (pty → renderer) — o ponto quente:**
```
pty.onData(chunk)
  → append no ring buffer (main, cap de 256 KB por pty)
  → acumula num buffer de coalescência
  → flush a cada frame (~16ms) OU quando o acumulado > 64 KB
  → webContents.send('pty:data', { ptyId, chunk })
  → renderer: term.write(chunk)
```
Coalescer por frame é obrigatório. Sem isso, um comando verboso gera dezenas de milhares de mensagens IPC por segundo e o renderer não acompanha. O ring buffer no main serve dois propósitos: é o que vai ser persistido no shutdown, e é o que permite reconectar um painel a um pty já existente (ex: o usuário fecha e reabre o painel sem matar o processo).

**Fluxo de entrada (renderer → pty):** `term.onData(d => window.hub.pty.write(ptyId, d))`, sem coalescência — latência de digitação é percebida, e o volume é trivial.

**Resize:** `ResizeObserver` no container → `FitAddon.fit()` → debounce de 100ms → `pty.resize(cols, rows)`. Sem o debounce, arrastar o divisor do split view dispara centenas de `resize` e programas TUI (incluindo o Claude Code) repintam violentamente.

**Exit:** `pty.onExit` → main remove do mapa, faz o flush final do ring buffer pro SQLite e emite `pty:exit`. O renderer mostra um banner inerte no painel ("processo encerrado — código 0") com botão *Reiniciar*, em vez de fechar o painel. Fechar o painel sozinho destruiria o scrollback que o usuário talvez ainda queira ler.

### 3.4 Camada de persistência: SQLite, não electron-store

**Decisão: `better-sqlite3`, com `electron-store` usado apenas para preferências triviais da aplicação (tema, tamanho de fonte, bounds da janela).**

Justificativa concreta, não dogmática:

| Critério | electron-store | SQLite (better-sqlite3) |
|---|---|---|
| Formato | um JSON monolítico, reescrito inteiro a cada `set` | escritas parciais, transacionais |
| Scrollback (centenas de KB a MBs) | catastrófico — serializa e reescreve tudo a cada flush | trivial — BLOB por pty, update isolado |
| Escrita atômica sob crash | arquivo pode corromper no meio da escrita | WAL + transações |
| Consulta ("último projeto usado") | carregar tudo em memória e filtrar em JS | `ORDER BY last_opened_at DESC LIMIT 1` |
| Evolução de schema | migração manual e frágil em JS | `PRAGMA user_version` + migrações versionadas |

O fator decisivo é o scrollback. O requisito crítico do produto (restaurar o terminal como estava) implica guardar blobs binários de tamanho não trivial, possivelmente para vários painéis, com flush periódico. Isso é exatamente o caso em que o modelo "um JSON gigante reescrito inteiro" desmorona — um flush de 5 painéis a cada 30s reescrevendo um JSON de 2 MB é desperdício de I/O e uma janela de corrupção aberta.

`better-sqlite3` é síncrono, o que no main process é uma vantagem (sem race entre flush e shutdown) desde que as escritas sejam pequenas e indexadas. Custo real: é um módulo nativo e precisa de `electron-rebuild`/`@electron/rebuild` no build — mas `node-pty` já é nativo, então esse custo de build já está pago de qualquer forma.

**Divisão de responsabilidades do armazenamento:**

| Onde | O que guarda |
|---|---|
| `electron-store` (`prefs.json`) | tema, fonte, `windowBounds`, flags de onboarding, `schemaVersion` do app |
| SQLite (`session.db`) | projetos, abas, layout, panes, cwd de cada pty, scrollback, cache do GitHub |
| `safeStorage` → BLOB no SQLite | token OAuth do GitHub (criptografado, nunca em texto puro) |
| Nada | histórico de conversa do Claude Code — isso é do Claude Code, em `~/.claude`, e o app **não** deve tocar |

Localização: `app.getPath('userData')/<nome-do-app>/`. Isso já é por-usuário do SO nativamente — que é exatamente a propriedade que queremos preservar para o futuro multi-dev sem refatoração.

---

## 4. Modelo de dados de sessão

Schema SQL completo. `PRAGMA user_version` controla migrações; toda mudança de schema entra como um arquivo `migrations/00N_descricao.sql` aplicado em ordem no boot.

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────
-- Perfil: a "conta local". Hoje sempre existe exatamente uma
-- linha ('default'). Existe desde já para que abrir o app para
-- outros devs (ou múltiplos perfis na mesma máquina) não exija
-- migrar todas as tabelas depois. Custo hoje: uma coluna.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE profile (
  id            TEXT PRIMARY KEY,           -- 'default'
  display_name  TEXT,
  created_at    INTEGER NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- Projeto = um diretório no disco. Unidade central do app.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE project (
  id              TEXT PRIMARY KEY,         -- uuid v4
  profile_id      TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,            -- padrão: basename do path
  root_path       TEXT NOT NULL,            -- absoluto
  git_remote_url  TEXT,                     -- detectado de .git/config
  gh_owner        TEXT,                     -- parseado do remote
  gh_repo         TEXT,
  default_shell   TEXT,                     -- override por projeto (opcional)
  color           TEXT,                     -- accent na sidebar
  last_opened_at  INTEGER,
  created_at      INTEGER NOT NULL,
  UNIQUE(profile_id, root_path)
);

-- ─────────────────────────────────────────────────────────────
-- Workspace = uma aba da sidebar. Cada uma tem seu próprio
-- layout de split view. Um projeto pode ter várias.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE workspace (
  id           TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES project(id) ON DELETE CASCADE, -- NULL = workspace global
  title        TEXT NOT NULL,
  icon         TEXT,
  sort_order   INTEGER NOT NULL,
  is_active    INTEGER NOT NULL DEFAULT 0,  -- só uma com 1
  layout_json  TEXT NOT NULL,               -- árvore do react-mosaic, ver abaixo
  updated_at   INTEGER NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- Pane = um painel folha dentro do layout de um workspace.
-- layout_json referencia panes por id.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE pane (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,              -- 'terminal' | 'github' | 'notes'
  config_json   TEXT NOT NULL,              -- ver discriminated union abaixo
  updated_at    INTEGER NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- Estado de terminal: o que permite a "restauração".
-- 1:1 com pane de kind='terminal'.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE terminal_state (
  pane_id        TEXT PRIMARY KEY REFERENCES pane(id) ON DELETE CASCADE,
  cwd            TEXT NOT NULL,             -- último cwd conhecido
  shell          TEXT NOT NULL,
  boot_command   TEXT,                      -- ex: 'claude' | NULL
  auto_run       INTEGER NOT NULL DEFAULT 0,
  cols           INTEGER NOT NULL DEFAULT 80,
  rows           INTEGER NOT NULL DEFAULT 24,
  scrollback     BLOB,                      -- últimos N KB, cru (com ANSI)
  scrollback_len INTEGER NOT NULL DEFAULT 0,
  exit_code      INTEGER,                   -- NULL se estava vivo no shutdown
  updated_at     INTEGER NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- Credenciais. O token JAMAIS entra em texto puro.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE credential (
  id              TEXT PRIMARY KEY,         -- 'github:default'
  profile_id      TEXT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,            -- 'github'
  account_login   TEXT,                     -- não-secreto, pra exibir na UI
  encrypted_blob  BLOB NOT NULL,            -- safeStorage.encryptString(json)
  scopes          TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- Cache do GitHub: faz o painel pintar instantaneamente no boot
-- (dados velhos + revalidação em background) e economiza rate limit.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE gh_cache (
  key         TEXT PRIMARY KEY,             -- 'prs:owner/repo:open'
  etag        TEXT,
  payload     TEXT NOT NULL,                -- JSON
  fetched_at  INTEGER NOT NULL
);

CREATE INDEX idx_workspace_project ON workspace(project_id);
CREATE INDEX idx_pane_workspace    ON pane(workspace_id);
CREATE INDEX idx_project_recent    ON project(last_opened_at DESC);
```

### 4.1 `layout_json` — árvore do react-mosaic

Serialização direta do `MosaicNode<string>`, onde as folhas são `pane.id`:

```json
{
  "direction": "row",
  "splitPercentage": 55,
  "first": "pane_7f3a",
  "second": {
    "direction": "column",
    "splitPercentage": 70,
    "first": "pane_9b21",
    "second": "pane_c4e0"
  }
}
```

Guardar exatamente a estrutura que a lib consome — sem formato intermediário "agnóstico" — é deliberado. Um formato próprio só se paga se houver intenção real de trocar de lib; aqui só adicionaria um mapeador bidirecional e uma classe de bugs. Se a troca acontecer um dia, escreve-se a migração naquele momento.

### 4.2 `pane.config_json` — union discriminada (TypeScript)

```ts
type PaneConfig =
  | { kind: 'terminal'; title: string; badge?: 'claude' | 'shell' }
  | { kind: 'github';   view: 'prs' | 'issues' | 'branches' | 'notifications';
                        filters?: { state?: 'open'|'closed'|'all'; author?: string;
                                    label?: string }; selectedNumber?: number }
  | { kind: 'notes';    docId: string };

type PaneKind = PaneConfig['kind'];
```

A union discriminada por `kind` é o que mantém a adição de novos tipos de painel (logs, docs, preview web) como um trabalho local: novo membro da union + novo componente no `PANE_REGISTRY`, zero mudança de schema.

### 4.3 Segurança do token do GitHub

Regras, em ordem de importância:

1. **O token nunca cruza o IPC.** O renderer pede `github.listPRs(owner, repo)`; quem tem o token e monta a chamada é o main. O renderer recebe dados já desserializados. Isso também blinda contra XSS vindo de conteúdo do GitHub (títulos de PR, corpos de issue, nomes de branch são conteúdo não confiável).
2. **Em repouso:** `safeStorage.encryptString(JSON.stringify({ access_token, refresh_token?, scopes, obtained_at }))` → BLOB. No macOS usa Keychain, no Windows DPAPI, no Linux o keyring disponível (libsecret/kwallet).
3. **Checar `safeStorage.isEncryptionAvailable()` antes de gravar.** No Linux sem keyring, isso retorna `false` — e o Electron cairia para uma "criptografia" com chave fixa, que é cosmética. Se indisponível: **não grava**, avisa o usuário na UI e opera em modo sessão-apenas (token em memória, perdido ao fechar). Falhar de forma visível é melhor que fingir segurança.
4. **Device flow, não client secret.** O fluxo de device code não exige segredo embarcado — o que é exatamente o que torna viável distribuir o app pra outros devs depois, sem ter um `client_secret` extraível do bundle.
5. **Escopos mínimos:** `repo`, `read:user`, `notifications`. Nada de `admin:*`, `delete_repo`, `workflow`.
6. **Revogação:** um botão "Desconectar GitHub" que apaga a linha de `credential` e limpa `gh_cache`.
7. **CSP estrita no renderer** e `webContents.setWindowOpenHandler` mandando qualquer link externo pro navegador do SO. Nenhum conteúdo do GitHub é renderizado como HTML bruto — markdown passa por sanitização (`rehype-sanitize`).

---

## 5. Decomposição de telas e componentes

### 5.1 Estrutura da janela

```
┌────┬──────────────────────────────────────────────────────────────┐
│    │ Toolbar: [Projeto ▾] [⎇ main] [▶ Claude Code] [⊞ Split] [⚙] │
│ S  ├──────────────────────────────────────────────────────────────┤
│ I  │                              │                               │
│ D  │   TerminalPanel              │   GitHubPanel                 │
│ E  │   ● claude                   │   PRs · Issues · Branches     │
│ B  │                              │                               │
│ A  │   $ claude                   │   #142 Fix pty resize   ✓ CI  │
│ R  │   ▌                          │   #139 Bump deps        ⨯ CI  │
│    │                              │                               │
│    ├──────────────────────────────┤                               │
│    │   TerminalPanel  ● shell     │                               │
│    │   $ npm test                 │                               │
└────┴──────────────────────────────┴───────────────────────────────┘
      StatusBar: cwd · branch · rate limit GitHub · 3 ptys ativos
```

### 5.2 Biblioteca de split view: `react-mosaic-component`

**Decisão: `react-mosaic-component`.**

Alternativas consideradas:

- **`golden-layout`** — mais poderoso (janelas destacáveis, abas dentro de painéis), mas é imperativo e baseado em DOM próprio; a integração com React é um wrapper que luta contra o ciclo de vida do React. Com `xterm.js` dentro (que já manipula DOM diretamente e é extremamente sensível a remount), isso multiplica o risco. Um remount inesperado de um `TerminalPanel` significa perder o estado visual do terminal.
- **`react-resizable-panels`** — excelente e leve, mas resolve *painéis redimensionáveis*, não *layout em árvore dinâmico*. Criar/remover/mover painéis arbitrariamente exige construir a árvore e o drag-and-drop à mão. Seria a escolha certa se o requisito fosse apenas "dividir ao meio".
- **Implementação própria** — descartada. É uma semana de trabalho para reimplementar mal algo que existe e funciona; o valor do produto não está aqui.

`react-mosaic` vence porque seu modelo é *exatamente* o modelo de dados que queremos persistir: uma árvore binária recursiva imutável de nós `{direction, first, second, splitPercentage}`. Serializar o layout é `JSON.stringify(mosaicNode)`. Restaurar é passar o objeto de volta como `value` de um componente controlado. Nenhum código de tradução. Além disso é totalmente controlado (o estado vive no nosso Zustand, não dentro da lib), tem drag-and-drop de painéis nativo, e é tipado em TS.

**Cuidado crítico de implementação:** o `react-mosaic` desmonta e remonta componentes quando a árvore muda. Isso **destruiria a instância do xterm.js**. A solução é desacoplar a instância do terminal do ciclo de vida do React:

```ts
// terminalRegistry.ts — fora do React, singleton no módulo
const registry = new Map<string, { term: Terminal; fit: FitAddon; el: HTMLDivElement }>();

export function acquireTerminal(paneId: string) {
  let entry = registry.get(paneId);
  if (!entry) {
    const el = document.createElement('div');
    el.className = 'xterm-host';
    const term = new Terminal({ fontFamily: 'JetBrains Mono', fontSize: 13,
                                scrollback: 10_000, allowProposedApi: true });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);              // abre no elemento órfão, ainda sem pai
    entry = { term, fit, el };
    registry.set(paneId, entry);
  }
  return entry;
}
```

O componente React só faz `containerRef.current.appendChild(entry.el)` no mount e `el.remove()` no unmount. O `<div>` com o xterm.js é *movido* pela árvore do DOM, nunca recriado. Esse padrão — DOM órfão reparentado — é a peça de engenharia mais importante do app inteiro. Sem ele, todo drag de painel limpa o terminal.

### 5.3 Árvore de componentes

```
<App>
  <TitleBar/>                      // frameless, drag region customizada
  <Sidebar>
    <ProjectList>                  // projetos recentes, ordenados por uso
      <ProjectItem/>               // clique = ativa; direito = menu contextual
    </ProjectList>
    <WorkspaceTabs>                // abas do projeto ativo
      <WorkspaceTab/>              // reordenável (dnd-kit), renomeável inline
    </WorkspaceTabs>
    <SidebarFooter/>               // avatar GitHub, status de conexão, config
  </Sidebar>
  <Main>
    <Toolbar>
      <ProjectSwitcher/>           // Cmd/Ctrl+P
      <BranchIndicator/>           // lê .git/HEAD, watcher via chokidar
      <LaunchClaudeButton/>        // ★ o atalho principal — Cmd/Ctrl+Enter
      <SplitControls/>             // dividir horizontal/vertical
      <SettingsButton/>
    </Toolbar>
    <MosaicRoot>                   // Mosaic controlado por zustand
      <PaneFrame>                  // borda/título/close/focus ring
        {PANE_REGISTRY[kind]}      // TerminalPanel | GitHubPanel | NotesPanel
      </PaneFrame>
    </MosaicRoot>
    <StatusBar/>
  </Main>
  <CommandPalette/>                // Cmd/Ctrl+K, fuse.js
  <Toaster/>
</App>
```

### 5.4 `TerminalPanel`

- Host do xterm.js via registry (§5.2). Addons: `FitAddon`, `SearchAddon` (Cmd+F), `WebLinksAddon` (URLs clicáveis abrem no navegador do SO), `WebglAddon` com fallback para canvas se o contexto WebGL falhar ou for perdido — `WebglAddon` é o que mantém 60fps em saída volumosa.
- Cabeçalho: badge (`claude` ou `shell`), `cwd` abreviado, indicador de atividade, botões *reiniciar* / *fechar*.
- Estado morto (`pty:exit`): overlay semitransparente com o código de saída e botão *Reiniciar*, preservando o scrollback legível por baixo.
- `Cmd/Ctrl+Shift+C/V` para copiar/colar; seleção automática não copia (comportamento de terminal padrão, evita surpresa).

### 5.5 `GitHubPanel`

Quatro visões em sub-abas, todas parametrizadas pelo `gh_owner/gh_repo` do projeto ativo:

| Visão | Endpoint | Conteúdo |
|---|---|---|
| PRs | `pulls.list` + `checks.listForRef` | número, título, autor, status de CI, reviewers, labels |
| Issues | `issues.listForRepo` (filtrando `pull_request`) | número, título, labels, assignee |
| Branches | `repos.listBranches` + `repos.compareCommits` | nome, ahead/behind vs default, última atividade |
| Notificações | `activity.listNotificationsForAuthenticatedUser` | escopo global, não por repo |

Padrão de busca: **stale-while-revalidate**. Pinta imediatamente do `gh_cache`, dispara a requisição com `If-None-Match: <etag>` em paralelo, atualiza se vier 200 (um 304 não consome rate limit). Polling em foco: 60s; sem foco da janela: pausado. Ação de refresh manual sempre disponível.

Ações de escrita no MVP, deliberadamente mínimas: abrir no navegador, copiar URL, fazer checkout do branch do PR (executa `git fetch && git checkout` **no terminal visível**, não escondido — o dev precisa ver o que roda em nome dele). Comentar, aprovar e fazer merge ficam para depois do MVP: são operações destrutivas que merecem uma UI de confirmação bem pensada.

### 5.6 O botão "Claude Code"

O elemento de maior valor da toolbar. Comportamento:

1. Se já existe um pane de terminal com `boot_command = 'claude'` vivo no workspace ativo → foca nele. (Não cria um segundo; dois Claude Code na mesma pasta confundem mais que ajudam.)
2. Se não existe → cria um pane de terminal. Se o layout está vazio, ocupa tudo; se há um painel, divide em `row` a 50%.
3. Faz spawn do pty em `project.root_path` e escreve `claude\r` no stdin.
4. Marca `boot_command='claude'`, `auto_run=1` no `terminal_state`.

Atalho global `Cmd/Ctrl+Enter`. Variante com Shift abre em split novo forçado. Modificadores extras (`--continue`, `--model`) ficam configuráveis por projeto nas preferências — `boot_command` é texto livre justamente para isso.

### 5.7 Seletor de sessões (tela de abertura, sem autenticação)

**Decisão de produto:** não existe tela de login no CoreDev. A tela que o dev vê ao abrir o app é o seletor de sessões/projetos — a mesma `ProjectList` da sidebar (§5.3), só que em destaque quando não há nenhum workspace ativo ainda (primeira execução) ou como ponto de partida normal (execuções seguintes, onde o último projeto ativo já vem pré-selecionado e restaurado — §6).

- **Primeira execução:** lista vazia, com um estado vazio convidativo ("Adicionar projeto" → `dialog.showOpenDirectory`). Nenhum campo de credencial em lugar nenhum desta tela.
- **Execuções seguintes:** a sessão anterior já volta restaurada (§6); o "seletor" nesse caso é só a sidebar normal, permitindo trocar de projeto/workspace — não é uma tela modal separada.
- **Autenticação do Claude Code:** não é modelada como estado do CoreDev. Quando o dev aciona o botão "Claude Code" (§5.6) num projeto pela primeira vez, o `claude` sobe no terminal e, se não houver sessão válida, é o próprio binário que conduz o fluxo de login dele (o dev vê e interage normalmente, como se tivesse aberto um terminal e digitado `claude`). O CoreDev não guarda token do Claude Code — quem guarda é o próprio Claude Code, na config dele.
- **Autenticação do GitHub:** só é solicitada no momento em que o dev pede explicitamente um painel de GitHub (arrasta um novo pane `kind='github'` ou clica em "Adicionar painel → GitHub"). Se não houver credencial em `credential`, dispara o device flow (§4.3/§6 Fase 6) inline, sem sair do painel. Um projeto/dev que nunca abre um painel de GitHub nunca vê nada relacionado a GitHub.

---

## 6. Fluxo de restauração de sessão no boot

### 6.1 A verdade técnica, sem eufemismo

**Um processo pty não sobrevive ao fechamento do app. Ponto.** O pty é filho do processo main; quando o Electron morre, o SO entrega SIGHUP e o shell e todos os seus descendentes morrem junto. Não existe truque razoável para contornar isso: daemonizar os shells num processo separado que persiste entre execuções é tecnicamente possível (um `forge-daemon` estilo tmux/mosh server) mas traz processos órfãos, gestão de ciclo de vida, atualização de versão descasada e bugs de segurança — custo desproporcional para um app pessoal.

**Portanto, "restaurar a sessão" significa exatamente estas cinco coisas, e nada além:**

| ✅ É restaurado fielmente | ❌ Não é (e não pode ser) restaurado |
|---|---|
| Projetos, abas e qual estava ativa | Estado de memória do processo anterior |
| Árvore de layout e proporções do split | Variáveis de ambiente setadas manualmente na sessão |
| Working directory de cada terminal | Processos que estavam em execução |
| Scrollback visual (texto do que aconteceu) | Um `vim`/TUI que estivesse aberto |
| Relançamento automático do `claude` no cwd certo | Stack de `pushd`, jobs em background |

**Decisão explícita de segurança/privacidade:** o histórico de *conversa* do Claude Code vive em `~/.claude` e tecnicamente `claude --continue` conseguiria retomar a conversa anterior. **O app não faz isso por padrão.** Auto-continuar a conversa automaticamente no boot amplia a superfície de risco (qualquer processo/automação que dispare o boot do app passa a ter acesso a retomar conversas anteriores sem interação explícita do dev) e não é uma troca que o usuário quer fazer só para ganhar um efeito cosmético de "continuidade". O `boot_command` padrão para panes marcados como Claude é simplesmente **`claude`** — uma sessão nova, exatamente como se o dev tivesse aberto um CMD/terminal do zero e digitado `claude`. O que é restaurado é o terminal pronto no diretório certo com o Claude Code já rodando, não a conversa em si. Se o dev quiser retomar uma conversa específica, ele digita `claude --continue` manualmente — é uma ação consciente dele, não um comportamento automático do app.

O scrollback restaurado precisa ser visualmente honesto: depois de escrever o buffer salvo, o app imprime um separador antes do novo prompt:

```
──────── sessão anterior · 24/09 18:42 ────────
```

Tudo acima do separador é histórico inerte. Tentar disfarçar isso produziria a pior UX possível: o dev pressiona ↑ esperando o histórico daquele shell e recebe outra coisa.

### 6.2 Sequência de boot, passo a passo

```
1. app.whenReady()
2. Abre session.db, aplica migrações pendentes (PRAGMA user_version).
3. Lê windowBounds do electron-store; valida contra os displays atuais
   (screen.getAllDisplays) — um monitor desconectado desde a última
   sessão colocaria a janela fora da tela. Fallback: centralizar.
4. Cria a BrowserWindow com show:false (evita flash de tela branca).
5. Carrega o renderer. Renderer monta o shell da UI em estado 'loading'.
6. Renderer: window.hub.session.load()
     → main devolve { profile, projects, activeWorkspace, panes,
                      terminalStates (SEM scrollback), ghAccount }
     ↑ scrollback fica de fora deste payload de propósito: são MBs
       potenciais e atrasariam o primeiro frame. Vem depois, por pane.
7. Renderer hidrata o Zustand e renderiza o Mosaic com o layout salvo.
   → Painéis aparecem com as dimensões corretas imediatamente.
8. ready-to-show → window.show(). Aqui o usuário já vê seu layout.
9. Para cada pane de terminal, em sequência (não em paralelo):
   a. Cria a instância do xterm.js via registry e faz o fit.
   b. window.hub.pty.restoreScrollback(paneId) → streaming do BLOB
      em chunks → term.write(). Terminal aparece "como estava".
   c. Valida o cwd: fs.existsSync(cwd)?
        sim  → usa.
        não  → sobe até o ancestral existente mais próximo; se nada,
               usa project.root_path; se nem isso, home. Avisa na UI.
   d. Escreve o separador de sessão anterior.
   e. pty.spawn({ cwd, shell, cols, rows }).
   f. Se auto_run=1 e boot_command != null:
        aguarda o "shell pronto" (ver §6.3) e escreve `${boot_command}\r`.
10. GitHubPanel pinta do gh_cache na hora; revalida com ETag em background.
11. Marca a sessão como 'ready'. Ativa o autosave (§6.4).
```

O passo 9 é sequencial de propósito: subir 4 shells de login simultaneamente (cada um avaliando `.zshrc`/perfil do PowerShell, possivelmente com nvm/pyenv) gera um pico de CPU que trava o primeiro segundo de uso. Sequencial, com o layout já visível, a experiência percebida é muito melhor mesmo sendo o total marginalmente mais lento.

### 6.3 Detectar que o shell está pronto para receber o comando

Escrever `claude\r` imediatamente após o spawn é uma corrida perdida — o rc file ainda está sendo avaliado e o comando se perde ou aparece picado. Estratégia, em ordem de preferência:

1. **Preferencial — sentinela:** o spawn injeta uma variável (`COREDEV_BOOT=1`) e o app escreve primeiro um comando inócuo que ecoa um marcador único (`printf '\033]1337;coredev-ready\007'` — uma sequência OSC que o xterm.js pode capturar via `registerOscHandler` sem poluir a tela). Ao ver o marcador, escreve o `boot_command`.
2. **Fallback — heurística de quiescência:** considerar pronto após 300ms sem nenhum dado vindo do pty, com teto de 3s.

Começar pelo fallback na fase 5 e evoluir para a sentinela é aceitável; o fallback funciona na prática na maioria das configurações.

### 6.4 Política de autosave

Salvar tudo a cada evento é inviável; salvar só no `before-quit` perde tudo num crash ou num kill. Política por tipo de dado:

| Dado | Quando salva |
|---|---|
| Layout / abas / panes | debounce de 500ms após a mudança |
| `cwd` de terminal | polling de 5s via `pty.process`/`/proc/<pid>/cwd`, grava se mudou |
| Scrollback | a cada 30s **e** no `before-quit` (flush síncrono) |
| `windowBounds` | debounce de 300ms em move/resize |
| Cache do GitHub | a cada fetch bem-sucedido |

O `before-quit` precisa de `event.preventDefault()`, flush síncrono de todos os ring buffers, `db.close()` e só então `app.exit()`. Com `better-sqlite3` isso é direto por ser síncrono — outra razão prática para a escolha da §3.4. Teto de tempo: se o flush passar de 2s, aborta e sai (melhor perder scrollback que travar o encerramento).

### 6.5 Sobre o `cwd`: honestidade sobre precisão

Ler o cwd de um pty é dependente de plataforma e não é 100% confiável: Linux via `/proc/<pid>/cwd`, macOS via `lsof -p` (lento) ou a API `proc_pidinfo`, Windows sem equivalente simples. Abordagem pragmática em camadas:

1. Tentar `pty.process`/leitura nativa quando barato (Linux).
2. **Primário e multiplataforma:** integração opcional de shell — se o dev aceitar, o app anexa um `precmd`/`PROMPT_COMMAND` que emite o cwd via sequência OSC 7 (`\033]7;file://host/path\007`), padrão já usado por iTerm2, WezTerm e VS Code. O xterm.js captura via `registerOscHandler`. Preciso, instantâneo e portável.
3. Fallback: assumir `project.root_path`.

OSC 7 é a resposta certa aqui e vale implementar já na fase 5 — sem ele, a promessa "volta no diretório onde você estava" só é verdadeira se o dev nunca tiver dado `cd`.

---

## 7. Roadmap faseado

Cada fase entrega algo executável e verificável à mão. Sem estimativas de tempo — apenas ordem de dependência.

### Fase 0 — Scaffold
**Entrega:** janela Electron abre, renderer React com HMR, build empacota.
- `electron-vite` como base (main + preload + renderer com um único config, HMR no renderer e reload no main; monta tudo isso melhor que um setup manual).
- TypeScript estrito: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- `electron-builder` para empacotar (NSIS no Windows, dmg no macOS, AppImage no Linux).
- Preload com `contextBridge`, `window.hub.app.version()` como prova de vida do IPC.
- ESLint + Prettier + `vitest`. `@electron/rebuild` no `postinstall` (obrigatório por causa dos nativos).
- **Critério de aceite:** `npm run dev` abre a janela, editar um `.tsx` reflete sem reiniciar, `npm run build` gera instalador.

### Fase 1 — Terminal funcional standalone
**Entrega:** um terminal real, utilizável, ocupando a janela inteira.
- `PtyManager` no main; canal IPC `pty:*` completo (spawn/write/resize/kill/data/exit).
- Coalescência por frame na saída (§3.3) — implementar já, não depois.
- `TerminalPanel` com xterm.js + Fit + WebGL + WebLinks + Search.
- `terminalRegistry` com DOM órfão reparentável (§5.2) — já nesta fase, porque a fase 3 depende disso e retrofitar depois é doloroso.
- Seleção de shell por SO, login shell no Unix.
- **Critério de aceite:** rodar `npm test` num repo real, `vim`, `htop`, redimensionar a janela e ver o reflow correto. Rodar `find /` e a UI não engasgar.

### Fase 2 — Claude Code integrado
**Entrega:** o botão que abre Claude Code no contexto do projeto.
- Seletor de diretório de projeto (`dialog.showOpenDialog`) e persistência inicial do projeto.
- Detecção de repo: ler `.git/config`, parsear o remote `origin` → `gh_owner`/`gh_repo`.
- `LaunchClaudeButton` + atalho `Cmd/Ctrl+Enter` (§5.6).
- Detecção do binário `claude` no PATH; erro acionável e claro se ausente (com link pra instalação), nunca um shell que só pisca.
- **Critério de aceite:** um clique, e o Claude Code está rodando no diretório certo, com o layout de TUI correto e responsivo a resize.

### Fase 3 — Abas e split view
**Entrega:** o canvas propriamente dito.
- Store Zustand com slices `projects`/`workspaces`/`layout`/`ptys`.
- Integração do `react-mosaic` controlado.
- Sidebar com lista de projetos + abas de workspace (`dnd-kit` para reordenar).
- `PANE_REGISTRY` e `PaneFrame` (título, foco, fechar).
- Comandos de split (horizontal/vertical), fechar painel, zoom de painel (`Cmd+Shift+Enter`).
- Anel de foco e `Cmd/Ctrl+1..9` para focar painéis.
- **Critério de aceite:** dois terminais lado a lado, arrastar um painel para outra posição **sem perder o conteúdo do terminal** (é o teste que valida a §5.2), redimensionar e ver ambos com reflow correto.

### Fase 4 — Persistência básica (layout + abas)
**Entrega:** fecha e reabre o app, o layout volta.
- `better-sqlite3` + runner de migrações + schema da §4.
- `SessionStore` no main; IPC `session:load|save|patch`.
- Autosave com debounce; `before-quit` com flush.
- `windowBounds` no electron-store, com validação de display.
- **Critério de aceite:** montar um layout de 3 painéis em 2 abas, fechar pelo botão da janela, reabrir e encontrar tudo idêntico (terminais ainda vazios nesta fase).

### Fase 5 — Restauração de terminal e cwd
**Entrega:** a promessa central do produto.
- Ring buffer de scrollback no main (cap de 256 KB por pty), flush periódico para BLOB.
- `restoreScrollback` em streaming por chunks.
- Rastreamento de cwd via OSC 7 + fallback (§6.5).
- Relançamento automático com `boot_command`, com detecção de shell pronto (§6.3).
- Separador visual de sessão anterior.
- Recuperação de cwd inexistente (diretório deletado/renomeado).
- Padrão de `boot_command` para panes Claude: `claude` (sessão nova por padrão — sem auto-continue de conversa, decisão de segurança, ver §6.1).
- **Critério de aceite:** conversa com o Claude Code em andamento → fechar o app → reabrir → o layout está lá, o scrollback está lá, o cwd está certo e o terminal já está com o Claude Code rodando (sessão nova, como digitar `claude` num CMD recém-aberto). Este é o momento em que o produto passa a existir.

### Fase 6 — GitHub
**Entrega:** o terceiro pilar.
- Device flow OAuth: `POST /login/device/code` → mostrar user code + copiar → abrir `github.com/login/device` no navegador do SO → polling em `/login/oauth/access_token` respeitando `slow_down`.
- `safeStorage` + tabela `credential`, com o tratamento de `isEncryptionAvailable() === false` (§4.3).
- `GitHubService` no main: Octokit com plugins `throttling` e `retry` (tratam 403/429 e secondary rate limits corretamente).
- `gh_cache` com ETag e stale-while-revalidate.
- `GitHubPanel` com as quatro visões; polling só com janela em foco.
- Ação de checkout de PR executada no terminal visível.
- Vinculação automática do painel ao repositório do projeto ativo.
- **Critério de aceite:** autenticar, ver PRs reais com status de CI, fazer checkout de um PR pelo painel e ver o comando rodando no terminal, e o painel voltar autenticado após reiniciar o app.

### Fase 7 — Polish e preparação para outros devs
**Entrega:** algo que um segundo dev consegue instalar e usar.
- Command palette (`Cmd/Ctrl+K`) com fuse.js, cobrindo todas as ações.
- Tela de preferências: tema, fonte, shell padrão, `boot_command` por projeto, tamanho de scrollback.
- Export/import de configuração: JSON com projetos, workspaces e layouts, **sem credenciais e sem scrollback** (portabilidade sem vazar segredo).
- Primeira execução: **sem tela de autenticação dedicada.** O app abre direto no seletor de sessões/projetos (§5.7) — mesmo na primeira vez, vazio, convidando a adicionar um projeto. Não há passo de "login" bloqueando o uso. Autenticação é *lazy* e por necessidade: Claude Code se autentica sozinho (é o próprio `claude` que trata isso na primeira vez que roda dentro do terminal — o CoreDev não pede nem guarda credencial nenhuma dele); GitHub só pede conexão (device flow) no momento em que o dev efetivamente adiciona/abre um painel de GitHub pela primeira vez, nunca antes. Isso mantém "abrir o app e já estar trabalhando" como o caminho padrão.
- Auto-update via `electron-updater` (GitHub Releases).
- Telemetria de crash **opt-in** e desligada por padrão.
- Assinatura de código (Apple notarization / Authenticode) — sem isso, o macOS e o SmartScreen tornam a instalação hostil para terceiros.
- Documentação do schema e migração do `profile.id` `'default'` para perfis reais (o schema já permite; é só UI).
- **Critério de aceite:** instalar num segundo computador limpo, seguir o onboarding e chegar num Claude Code rodando em menos de dois minutos.

### Depois do MVP (backlog explícito, fora de escopo agora)
Ações de escrita no GitHub (comentar/aprovar/merge), painel de notas/scratchpad por projeto, preview web embutido, múltiplas janelas, sincronização de sessão entre máquinas, painéis destacáveis, integração com o Claude Code via SDK em vez de CLI para painéis de status estruturados.

---

## 8. Riscos técnicos e decisões em aberto

Cada item traz o teste prático que deve resolvê-lo.

| # | Risco | Impacto | Como validar / mitigar |
|---|---|---|---|
| R1 | **Remount do react-mosaic destruindo o xterm.js** | Alto — quebra o requisito central | O padrão de DOM órfão (§5.2) deve ser validado na fase 1 com um teste manual de drag. Se falhar, plano B: `react-resizable-panels` + árvore própria, trocando drag-and-drop por comandos de split. |
| R2 | **Throughput de IPC do pty** | Alto — UI travada | Benchmark na fase 1: `yes` por 10s, `find / -type f`, `cat` de um arquivo de 50 MB. Medir tempo de frame. Se a coalescência por frame não bastar, usar `MessagePort` dedicado (bypassa o roteamento IPC padrão) e transferir `Uint8Array`. |
| R3 | **ConPTY no Windows** | Alto — o usuário está em Win10 19045 | ConPTY tem histórico de bugs de resize e sequências fantasma. Testar cedo com `claude`, `vim` e resize agressivo. Mitigação: fixar uma versão conhecida-boa do node-pty; se necessário, permitir fallback para winpty. |
| R4 | **Módulos nativos e empacotamento** | Alto — pode inviabilizar o build | `node-pty` + `better-sqlite3` exigem rebuild contra o ABI do Electron, em três SOs e duas arquiteturas (incluindo arm64 do macOS). Resolver na fase 0, não na 7. CI com matriz de SOs desde cedo. |
| R5 | **`safeStorage` indisponível no Linux** | Médio | Detectar e degradar explicitamente para modo sessão-apenas com aviso visível (§4.3). Nunca gravar com criptografia cosmética. |
| R6 | **Tamanho e crescimento do scrollback** | Médio — banco inflando | Cap de 256 KB por pty é o chute inicial; validar se cobre uma sessão útil de Claude Code (a saída dele é verbosa). Testar 1 MB. Considerar compressão (`zlib.gzipSync` — texto de terminal comprime ~10:1) e `VACUUM` periódico. Decisão em aberto: guardar bytes crus com ANSI (fiel, pesado) vs. estado serializado do buffer do xterm.js (via `SerializeAddon`, mais compacto e já reflowado). **`SerializeAddon` é provavelmente a resposta certa** — validar na fase 5. |
| R7 | **Rate limit do GitHub** | Médio | 5.000 req/h autenticado parece folgado, mas `checks.listForRef` por PR multiplica rápido. ETag + polling só com foco + plugin de throttling. Mostrar o rate limit restante na status bar durante o desenvolvimento. |
| R8 | **Detecção de cwd** | Médio — degrada a restauração | OSC 7 exige cooperação do shell. Decisão em aberto: quão agressivo ser ao sugerir a modificação do rc file do usuário. Proposta: pedir consentimento explícito, escrever um bloco delimitado e reversível, e funcionar (pior) sem isso. |
| R9 | **Detecção de "shell pronto"** | Médio | A heurística de quiescência falha com prompts lentos (nvm, starship, direnv). Validar em ambientes reais; a sentinela OSC é a solução robusta. |
| R10 | **Claude Code como TUI dentro de pty aninhado** | Médio | Claude Code pode detectar o terminal por `TERM`/capacidades. Garantir `TERM=xterm-256color`, `COLORTERM=truecolor` e dimensões corretas no spawn. Testar renderização de caixas, cores e mouse. |
| R11 | **Segurança de conteúdo do GitHub** | Médio | Títulos/corpos são entrada não confiável. CSP estrita, zero `dangerouslySetInnerHTML` sem `rehype-sanitize`, links externos sempre via `shell.openExternal`. |
| R12 | **Consumo de memória com muitos panes** | Baixo/Médio | Cada xterm.js com WebGL tem custo real. Testar 8 painéis. Mitigação: descartar o contexto WebGL de painéis sem foco há muito tempo. |
| R13 | **Migrações de schema** | Baixo | Resolvido por design com `user_version` + migrações versionadas desde a fase 4. Escrever a migração 002 fictícia cedo só para validar o runner. |

**Decisões conscientemente adiadas:** monorepo vs. pasta única (começar com pasta única, `src/main`, `src/preload`, `src/renderer`, `src/shared`); testes E2E com Playwright (adicionar na fase 4, quando houver estado a regredir); i18n (interface em inglês, dado o público futuro; nenhuma string hardcoded fora de um módulo de textos).

---

## 9. Próximos passos imediatos

Em ordem, para começar a implementar:

1. **Scaffold com `electron-vite`** (`npm create @quick-start/electron`, template react-ts), adicionar `node-pty` e `better-sqlite3`, configurar `@electron/rebuild` no `postinstall`. **Validar o build empacotado em Windows imediatamente** — módulos nativos são o risco R4 e precisam morrer na primeira hora, não na fase 7.
2. **Spike de risco, antes de qualquer UI bonita:** uma janela, um terminal em tela cheia, rodar `claude` dentro. Isso valida R3, R10 e o essencial de R2 de uma vez. Se este spike não ficar sólido, todo o resto do roteiro precisa ser revisto.
3. **Spike do reparenting do xterm.js (R1):** dois painéis com react-mosaic, arrastar um sobre o outro, confirmar que o conteúdo do terminal sobrevive. É o segundo teste go/no-go.
4. **Congelar as interfaces de IPC** em `src/shared/ipc.ts` — tipos de request/response de cada canal, importados por main e preload. Fazer isso antes de escrever handlers evita divergência de contrato.
5. **Escrever `migrations/001_initial.sql`** com o schema da §4 e o runner de migração, mesmo antes de usar o banco de verdade. A forma dos dados guia a forma do código.
6. **Registrar o OAuth App no GitHub** (device flow habilitado) e anotar o `client_id` — não é segredo, pode ir no bundle. Fazer cedo porque a aprovação e a configuração são trabalho burocrático que não deve bloquear a fase 6.
7. Só então seguir a Fase 0 → 7 na ordem.

**Critério de sucesso do MVP, em uma frase:** o usuário abre o CoreDev de manhã e, em menos de cinco segundos e zero cliques de configuração, está com o terminal do Claude Code já rodando no projeto certo ao lado dos PRs abertos do repositório — e nunca mais precisa abrir o navegador, digitar `cd`, ou lembrar de rodar `claude` manualmente para começar a trabalhar.
