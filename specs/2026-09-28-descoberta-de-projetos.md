# Descoberta automática de projetos

## Intenção

Hoje um projeto só existe na sidebar se o usuário o abriu pelo seletor de diretório. Quem
guarda tudo numa pasta raiz (`C:\dev`) precisa adicionar cada projeto na mão, e uma pasta
criada fora do app nunca aparece.

Passa a existir uma pasta raiz de projetos, escolhida uma vez. Todo subdiretório dela vira
um projeto na sidebar, recalculado a cada abertura do app e sob demanda. E dá para criar um
projeto novo pelo próprio app, que cria a pasta na raiz e abre o terminal nela.

## Critério de aceite

1. Escolher a pasta raiz
   - Botão de raiz na sidebar, escolher `C:\dev`.
   - Esperado: todo subdiretório de `C:\dev` aparece na sidebar, com `owner/repo` nos que
     têm remote `origin` no GitHub.

2. Pasta criada fora do app aparece sozinha
   - Com a raiz definida, criar `C:\dev\teste-descoberta` pelo explorador, reabrir o app.
   - Esperado: `teste-descoberta` está na sidebar, sem nenhuma ação do usuário.

3. Criar projeto pelo app
   - Botão de novo projeto, informar um nome.
   - Esperado: a pasta é criada dentro da raiz, o projeto abre num pane com o `claude`
     rodando, e continua na sidebar depois de reabrir o app.

4. Ruído não vira projeto
   - Esperado: `node_modules`, pastas começando com `.` e arquivos soltos ficam de fora.

5. `npm run typecheck && npm test` verdes.

## Fora de escopo

- Watcher em tempo real (`fs.watch`) da pasta raiz: a lista é recalculada na abertura e no
  botão de atualizar, não enquanto o app está aberto.
- Mais de uma pasta raiz.
- Scan recursivo: só o primeiro nível da raiz vira projeto.
- Template ou scaffold no projeto criado — a pasta nasce vazia.
