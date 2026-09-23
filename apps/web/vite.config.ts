import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { handleProfileRequest } from '../../packages/core/src/steam/profile.ts'

// На Vercel /api отвечает серверная функция, а локально отвечаем сами, чтобы не ставить vercel cli
function steamApi(): Plugin {
  return {
    name: 'steam-api',
    configureServer(server) {
      server.middlewares.use('/api/steam/profile', async (req, res) => {
        const path = (req as { originalUrl?: string }).originalUrl ?? req.url ?? '/'
        const response = await handleProfileRequest(
          new Request(new URL(path, 'http://localhost'), { method: req.method }),
        )
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        res.end(await response.text())
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), steamApi()],
  // воркер вырезки фона грузит части transformers динамически, это работает только в формате ES
  worker: { format: 'es' },
  // Эти библиотеки подключаются на ходу: кодировщик гифок — при сборке, декодеры — когда открыли
  // видео или гифку. Если Vite встретит их впервые посреди работы, он перезапакует зависимости
  // и перезагрузит страницу, потеряв всё, что человек успел собрать
  optimizeDeps: { include: ['gifenc', 'gifuct-js', 'mediabunny'] },
})
