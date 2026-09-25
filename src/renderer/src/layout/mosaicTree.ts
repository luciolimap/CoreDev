import type { MosaicNode } from 'react-mosaic-component'

/**
 * Acha o caminho até uma folha (paneId) na árvore do Mosaic. A lib só
 * expõe `getPathToCorner` (cantos) e `getLeaves`; para split/close por
 * paneId específico precisamos caminhar a árvore nós mesmos.
 */
export function findPanePath(node: MosaicNode<string> | null, paneId: string): number[] | null {
  if (node === null) return null
  if (typeof node === 'string') return node === paneId ? [] : null
  if (node.type === 'split') {
    for (let i = 0; i < node.children.length; i++) {
      const found = findPanePath(node.children[i] ?? null, paneId)
      if (found) return [i, ...found]
    }
    return null
  }
  return null
}
