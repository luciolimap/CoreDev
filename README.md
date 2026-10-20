# CoreDev

Hub desktop para desenvolvedores: Claude Code, GitHub e terminal numa única janela.

![Status](https://img.shields.io/badge/status-em%20desenvolvimento-orange?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)

## O problema

O fluxo de trabalho de quem desenvolve com Claude Code costuma ficar espalhado em várias janelas: um terminal com o Claude Code, o navegador no GitHub do repositório e outro terminal para rodar testes e build. Cada troca de contexto custa tempo, e toda vez que a máquina reinicia é preciso remontar esse ambiente à mão.

## A proposta

O CoreDev é um espaço de trabalho único, organizado em torno do **projeto ativo**. Ao abrir um projeto, o terminal já está no diretório certo e o Claude Code já está rodando. Os painéis de projetos diferentes convivem lado a lado num mesmo canvas, divisível na horizontal e na vertical.

O objetivo final é a **persistência real de sessão**: fechar o app no meio do trabalho e, ao reabrir, encontrar o mesmo layout, o mesmo histórico do terminal, o mesmo diretório e o Claude Code rodando de novo.

## Funcionalidades

**Disponível hoje**

- Terminal completo (xterm.js + node-pty), com reflow ao redimensionar e saída coalescida por frame para não travar a interface
- Sidebar com os projetos abertos; cada projeto abre seu próprio terminal com o `claude` já em execução
- Canvas com split view (react-mosaic): dividir, fechar e maximizar painéis
- Terminais de todos os projetos continuam rodando em segundo plano ao trocar o foco
- Atalhos: `Ctrl/Cmd+Shift+Enter` maximiza o painel, `Ctrl/Cmd+1..9` foca um painel pelo índice

**Em desenvolvimento**

- Persistência de layout e abas com SQLite
- Restauração do histórico do terminal e do diretório de trabalho
- Painel do GitHub (PRs, status de CI e checkout de PR pelo terminal), com login via device flow e token protegido pelo `safeStorage`
- Command palette, tela de preferências e auto-update

## Stack

| Camada | Tecnologias |
| --- | --- |
| Desktop | Electron, electron-vite, electron-builder |
| Interface | React, TypeScript, Zustand, react-mosaic-component |
| Terminal | xterm.js, node-pty |
| Qualidade | ESLint, Prettier, Vitest, TypeScript estrito |

## Arquitetura

O app segue a separação de processos do Electron:

- **Main** (`src/main`): gerencia os processos de terminal (`ptyManager.ts`) e os projetos (`projectService.ts`)
- **Preload** (`src/preload`): expõe uma API tipada ao renderer via `contextBridge`
- **Renderer** (`src/renderer`): interface em React com o layout em mosaico, a sidebar e os painéis de terminal
- **Shared** (`src/shared/ipc.ts`): contratos de IPC compartilhados entre os processos

O roteiro completo, com modelo de dados, decisões técnicas e fases, está em [`ROADMAP.md`](ROADMAP.md).

## Como rodar

**Pré-requisitos**

- Node.js 20 ou superior
- [Claude Code](https://docs.claude.com/en/docs/claude-code) instalado e disponível no `PATH`
- Ferramentas de compilação para módulos nativos (o `node-pty` é compilado na instalação): no Windows, Visual Studio Build Tools com a carga "Desenvolvimento para desktop com C++"

**Instalação e desenvolvimento**

```bash
git clone https://github.com/luciolimap/CoreDev.git
cd CoreDev
npm install
npm run dev
```

**Outros comandos**

```bash
npm run typecheck   # checagem de tipos (main e renderer)
npm run lint        # ESLint
npm test            # testes com Vitest
npm run build:win   # gera o instalador para Windows (também há build:mac e build:linux)
```

## Status

Projeto em desenvolvimento ativo. As fases de scaffold, terminal, integração com o Claude Code e split view estão concluídas; a próxima etapa é a persistência de sessão. O andamento detalhado está em [`current-state.md`](current-state.md).

## Autor

Desenvolvido por [Lúcio Lima](https://github.com/luciolimap) · [LinkedIn](https://www.linkedin.com/in/luciolimap/)
