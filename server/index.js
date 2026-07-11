import express from 'express'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = process.env.PORT || 3000
const MAX_PEERS = 6
// ponytail: per-boot secret unless env set — host tokens die on redeploy, fine for ephemeral rooms
const SECRET = process.env.SECRET || crypto.randomBytes(32).toString('hex')

const hostToken = (roomId) => crypto.createHmac('sha256', SECRET).update(roomId).digest('hex').slice(0, 24)

const app = express()
const server = createServer(app)

// --- REST ---
app.post('/api/rooms', (_req, res) => {
  const s = () => crypto.randomBytes(4).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, 'x')
  const roomId = `${s().slice(0, 3)}-${s().slice(0, 4)}-${s().slice(0, 3)}`
  res.json({ roomId, hostToken: hostToken(roomId) })
})

let iceCache = { servers: null, until: 0 }
app.get('/api/ice', async (_req, res) => {
  if (iceCache.servers && Date.now() < iceCache.until) return res.json({ iceServers: iceCache.servers })
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }]
  const { CF_TURN_KEY_ID, CF_TURN_API_TOKEN, TURN_URL, TURN_USERNAME, TURN_PASSWORD } = process.env
  if (CF_TURN_KEY_ID && CF_TURN_API_TOKEN) {
    try {
      const r = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${CF_TURN_KEY_ID}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${CF_TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttl: 14400 }),
        },
      )
      const body = await r.json()
      const cf = body.iceServers ? (Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers]) : []
      servers.push(...cf)
      iceCache = { servers, until: Date.now() + 3600_000 } // creds live 4h, cache 1h
    } catch (e) {
      console.error('cloudflare turn error', e)
    }
  } else if (TURN_URL && TURN_USERNAME && TURN_PASSWORD) {
    servers.push({ urls: TURN_URL, username: TURN_USERNAME, credential: TURN_PASSWORD })
  }
  res.json({ iceServers: servers })
})

// --- Signaling ---
// rooms: roomId -> Map<peerId, {ws, name, isHost}>
const rooms = new Map()
const wss = new WebSocketServer({ server, path: '/ws' })

const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg))

wss.on('connection', (ws) => {
  let roomId = null
  let peerId = null
  ws.alive = true
  ws.on('pong', () => (ws.alive = true))

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    if (msg.t === 'join') {
      if (roomId) return
      if (typeof msg.room !== 'string' || !/^[\w-]{1,64}$/.test(msg.room)) return send(ws, { t: 'error', msg: 'bad room' })
      const name = String(msg.name || 'Guest').slice(0, 40)
      const room = rooms.get(msg.room) || new Map()
      if (room.size >= MAX_PEERS) return send(ws, { t: 'full' })
      rooms.set(msg.room, room)
      roomId = msg.room
      peerId = crypto.randomUUID()
      const isHost = msg.hostToken === hostToken(roomId)
      const peers = [...room.entries()].map(([id, p]) => ({ id, name: p.name, isHost: p.isHost }))
      room.set(peerId, { ws, name, isHost })
      send(ws, { t: 'joined', id: peerId, isHost, peers })
      for (const [, p] of room) if (p.ws !== ws) send(p.ws, { t: 'peer-joined', peer: { id: peerId, name, isHost } })
      return
    }

    if (!roomId) return
    const room = rooms.get(roomId)
    if (!room) return

    if (msg.t === 'signal' && msg.to) {
      const target = room.get(msg.to)
      if (target) send(target.ws, { t: 'signal', from: peerId, data: msg.data })
    } else if (msg.t === 'state') {
      // {mic:boolean, cam:boolean} broadcast to everyone else
      for (const [id, p] of room) if (id !== peerId) send(p.ws, { t: 'state', from: peerId, state: msg.state })
    } else if (msg.t === 'mute' && msg.to) {
      // host asks a peer to mute its own track (P2P: recipient enforces)
      const me = room.get(peerId)
      const target = room.get(msg.to)
      if (me?.isHost && target) send(target.ws, { t: 'mute', by: me.name })
    }
  })

  ws.on('close', () => {
    if (!roomId) return
    const room = rooms.get(roomId)
    if (!room) return
    room.delete(peerId)
    if (room.size === 0) rooms.delete(roomId)
    else for (const [, p] of room) send(p.ws, { t: 'peer-left', id: peerId })
  })
})

// kill dead connections (mobile browsers drop without close frames)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate()
      continue
    }
    ws.alive = false
    ws.ping()
  }
}, 30_000)

// --- Static SPA ---
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
app.use(express.static(dist))
app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))

server.listen(PORT, () => console.log(`meetup on :${PORT}`))
