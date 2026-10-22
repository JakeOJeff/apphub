// Production server: serves the built UI from dist/ and the API. Local only.
// npm run build && npm start
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { api } from './node.ts'

const app = new Hono()
app.route('/', api)
app.use('/*', serveStatic({ root: './dist' }))
app.get('*', serveStatic({ path: './dist/index.html' }))

const port = Number(process.env.PORT ?? 4310)
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => console.log(`apphub on http://localhost:${port}`))
