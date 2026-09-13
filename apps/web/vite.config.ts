import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { handleProfileRequest } from '../../packages/core/src/steam/profile'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

// На Vercel /api отвечает серверная функция, а локально отвечаем сами, чтобы не ставить vercel cli
function steamApi(apiKey?: string): Plugin {
  return {
    name: 'steam-api',
    configureServer(server) {
      server.middlewares.use('/api/steam/profile', async (req, res) => {
        const path = (req as { originalUrl?: string }).originalUrl ?? req.url ?? '/'
        const response = await handleProfileRequest(
          new Request(new URL(path, 'http://localhost'), { method: req.method }),
          { apiKey },
        )
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        res.end(await response.text())
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '')
  return {
    plugins: [react(), tailwindcss(), steamApi(env.STEAM_API_KEY)],
  }
})
