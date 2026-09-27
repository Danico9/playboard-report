// ─── Plugin Vite: monta la API local (server/api.mjs) en el servidor de desarrollo y en `vite preview` ───

import { createApi, NOTES_DIR, REPORTS_DIR } from '../server/api.mjs'

export default function playboard() {
  return {
    name: 'playboard',
    config: () => ({
      server: { watch: { ignored: ['**/.cache/**'] } },
    }),
    configureServer(server) {
      const api = createApi({ log: (m) => server.config.logger.info(m, { timestamp: true }) })
      api.runIngest()
      server.middlewares.use(api.middleware)
      server.watcher.add([REPORTS_DIR, NOTES_DIR])
      server.watcher.on('all', (event, file) => api.handleFsEvent(event, file))
    },
    configurePreviewServer(server) {
      const api = createApi()
      api.runIngest()
      server.middlewares.use(api.middleware)
    },
  }
}
