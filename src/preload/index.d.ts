import { ElectronAPI } from '@electron-toolkit/preload'
import type { Hub } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    hub: Hub
  }
}
