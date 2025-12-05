import { defineConfig } from '@tanstack/start/config'
import vite from 'vite'

export default defineConfig({
  vite: (ctx) => {
    return vite.defineConfig({
      server: {
        port: 3010,
        host: '0.0.0.0',
      },
    })
  },
})

