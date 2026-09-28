# Persistência de sessão em JSON, não em SQLite

Data: 2026-09-28
Status: vigente
Revoga: ROADMAP.md §3.4 e §4 (schema SQLite com `better-sqlite3` e runner de migrações)

## Contexto

As fases 4 e 5 do ROADMAP pediam `better-sqlite3`, um schema relacional com sete tabelas,
`user_version` e um runner de migrações versionadas, guardando layout, panes e scrollback.

## Decisão

A sessão é gravada em arquivos no `userData`:

- `session.json` — layout, panes, pane focado e pane com zoom, com escrita atômica
  (arquivo temporário + `rename`) e um campo `version`; snapshot ilegível ou de outra
  versão é descartado no boot em vez de quebrar a abertura do app.
- `scrollback/<paneId>.txt` — um arquivo por pane, cap de 256 KB cortando o começo.

## Por quê

- O app é de um usuário, uma janela e uma máquina. Não há consulta relacional, concorrência
  de escrita nem relatório sobre os dados — só "carrega tudo no boot, grava tudo no autosave".
  Um schema relacional aqui é vocabulário sem pergunta que o use.
- `better-sqlite3` é um módulo nativo. O projeto já paga esse custo com o `node-pty`
  (risco R4 do ROADMAP, ConPTY no Windows). Um segundo módulo nativo dobra a superfície de
  rebuild por versão de Electron, por SO e por arquitetura, em troca de nada que o JSON não dê.
- O runner de migrações existiria para versionar um schema que tem um único formato.
  O campo `version` no JSON resolve o mesmo problema em uma linha.

## Custo aceito

- Sem consulta parcial: o boot lê o arquivo inteiro. Com dezenas de kilobytes, é irrelevante.
- Sem `VACUUM` nem compressão; o cap por pane e o prune dos panes que saíram do layout
  fazem o papel de manter o diretório pequeno.
- Se um dia o app guardar histórico consultável (busca em sessões antigas, métricas por
  projeto), esta decisão deixa de valer e o SQLite volta à mesa.
