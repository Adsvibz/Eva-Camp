import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
export default defineConfig({ main:{plugins:[externalizeDepsPlugin()],build:{rollupOptions:{input:resolve('src/main/main.ts'),output:{entryFileNames:'main.cjs'}}}},preload:{plugins:[externalizeDepsPlugin()],build:{rollupOptions:{input:resolve('src/main/preload.ts'),output:{entryFileNames:'preload.cjs'}}}},renderer:{root:resolve('src/renderer'),plugins:[react()]} })
