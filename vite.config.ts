import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { getRequestListener } from '@hono/node-server'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Serves the apphub API (server/node.ts) from the dev server, so `npm run dev` is one process.
function apphubApi(): Plugin {
  return {
    name: 'apphub-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        // Load per request so edits to server/ apply without restarting.
        const { api } = await server.ssrLoadModule('/server/node.ts')
        getRequestListener(api.fetch)(req, res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Server-only settings (APPHUB_ENCRYPTION_KEY) from .env.local, never exposed to the client.
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'APPHUB_'))
  return {
    plugins: [react(), tailwindcss(), apphubApi()],
    server: { host: '127.0.0.1' },
  }
})
