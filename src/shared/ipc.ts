/**
 * Contrato de IPC entre main e renderer. Importado por ambos os lados
 * (main/preload e renderer) para que request/response nunca divirjam.
 * Ver ROADMAP.md §9.5 — congelar isso antes de escrever handlers.
 */

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
}

export const IPC_CHANNELS = {
  APP_GET_INFO: 'app:getInfo'
} as const
