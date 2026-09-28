/**
 * OSC 7: o shell anuncia o diretório atual com `ESC ] 7 ; file://<host><path> BEL`
 * (ou terminado por ST, `ESC \`). É o único jeito confiável de saber o `cwd` de
 * um pty — ler `/proc` ou o processo filho erra com shells que fazem fork.
 *
 * Exige cooperação do shell (ROADMAP R8). O app não escreve no rc do usuário:
 * sem OSC 7, o `cwd` continua sendo o do spawn e nada quebra.
 */
const OSC7 = /\x1b\]7;file:\/\/([^/]*)([^\x07\x1b]*)(?:\x07|\x1b\\)/g

/** Converte o path de uma URL `file://` para caminho de SO. */
function urlPathToOsPath(urlPath: string): string {
  const decoded = decodeURIComponent(urlPath)
  // `/C:/Users/x` no Windows vira `C:/Users/x`; em Unix o path já é o caminho.
  return /^\/[A-Za-z]:/.test(decoded) ? decoded.slice(1) : decoded
}

/**
 * Devolve o último `cwd` anunciado no pedaço de saída, ou `null` se não houver.
 * O último vence: um `cd` seguido de outro no mesmo frame coalescido.
 */
export function parseOsc7Cwd(chunk: string): string | null {
  let last: string | null = null
  for (const match of chunk.matchAll(OSC7)) {
    const path = match[2]
    if (path) last = urlPathToOsPath(path)
  }
  return last
}
