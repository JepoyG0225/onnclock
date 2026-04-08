const http = require('http')
const next = require('next')
const { WebSocketServer } = require('ws')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const PORT = process.env.PORT || 3001

const clients = new Set()

function broadcast(payload) {
  const data = JSON.stringify(payload)
  for (const ws of clients) {
    if (ws.readyState !== ws.OPEN) continue
    if (payload.companyId && ws.meta?.companyId !== payload.companyId) continue
    if (payload.employeeId && ws.meta?.employeeId !== payload.employeeId) continue
    ws.send(data)
  }
}

global.__wsBroadcast = broadcast

app.prepare().then(() => {
  const server = http.createServer((req, res) => handle(req, res))

  const wss = new WebSocketServer({ server, path: '/ws' })
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const companyId = url.searchParams.get('companyId') || undefined
    const employeeId = url.searchParams.get('employeeId') || undefined
    const userId = url.searchParams.get('userId') || undefined
    ws.meta = { companyId, employeeId, userId }
    clients.add(ws)
    ws.on('close', () => clients.delete(ws))
  })

  server.listen(PORT, () => {
    console.log(`> Ready on http://localhost:${PORT}`)
  })
})
