import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Preload roda em sandbox e precisa ser CommonJS de verdade — com
// "type": "module" no package.json, um .js puro vira ESM e o Electron
// falha silenciosamente ao carregar o preload (window.hub nunca aparece).
// Forçar extensão .cjs resolve isso independente do "type" do package.json.
const cjsOutput = {
  rollupOptions: {
    output: {
      format: 'cjs' as const,
      entryFileNames: '[name].cjs'
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: cjsOutput
  },
  preload: {
    // Sem externalizeDepsPlugin aqui: preload roda em sandbox, onde
    // require() só resolve 'electron' e módulos nativos do Node — um
    // pacote como @electron-toolkit/preload precisa vir embutido no bundle.
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: cjsOutput
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
