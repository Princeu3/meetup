// Mesh WebRTC room behind a LiveKit-shaped facade.
// ponytail: P2P mesh capped at 6; swap this class's internals for LiveKit SDK when >6 needed.

export type Participant = {
  id: string
  name: string
  isHost: boolean
  isLocal: boolean
  stream: MediaStream | null
  mic: boolean
  cam: boolean
}

type Peer = {
  pc: RTCPeerConnection
  polite: boolean
  makingOffer: boolean
  ignoreOffer: boolean
  participant: Participant
}

type Events = {
  update: void // participants or state changed
  'muted-by-host': string // host name
  full: void
  ended: void
}

export class MeetRoom {
  localId = ''
  localParticipant: Participant = {
    id: '',
    name: '',
    isHost: false,
    isLocal: true,
    stream: null,
    mic: true,
    cam: true,
  }
  private peers = new Map<string, Peer>()
  private ws: WebSocket | null = null
  private iceServers: RTCIceServer[] = []
  private roomId = ''
  private hostToken: string | undefined
  private closed = false
  private listeners = new Map<keyof Events, Set<(d: any) => void>>()

  on<K extends keyof Events>(ev: K, fn: (data: Events[K]) => void) {
    if (!this.listeners.has(ev)) this.listeners.set(ev, new Set())
    this.listeners.get(ev)!.add(fn)
    return () => this.listeners.get(ev)!.delete(fn)
  }
  private emit<K extends keyof Events>(ev: K, data?: Events[K]) {
    this.listeners.get(ev)?.forEach((fn) => fn(data))
  }

  get participants(): Participant[] {
    return [this.localParticipant, ...[...this.peers.values()].map((p) => p.participant)]
  }

  async join(roomId: string, name: string, stream: MediaStream | null, opts: { hostToken?: string; mic: boolean; cam: boolean }) {
    this.roomId = roomId
    this.hostToken = opts.hostToken
    this.localParticipant.name = name
    this.localParticipant.stream = stream
    // joining with no devices (denied/absent) is allowed — recv-only participant
    this.localParticipant.mic = opts.mic && !!stream?.getAudioTracks().length
    this.localParticipant.cam = opts.cam && !!stream?.getVideoTracks().length
    stream?.getAudioTracks().forEach((t) => (t.enabled = this.localParticipant.mic))
    stream?.getVideoTracks().forEach((t) => (t.enabled = this.localParticipant.cam))
    this.iceServers = (await fetch('/api/ice').then((r) => r.json()).catch(() => ({ iceServers: [] }))).iceServers
    this.connectWs()
  }

  private connectWs() {
    if (this.closed) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    this.ws = ws
    ws.onopen = () =>
      this.send({ t: 'join', room: this.roomId, name: this.localParticipant.name, hostToken: this.hostToken })
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data))
    ws.onclose = () => {
      if (this.closed) return
      // rejoin from scratch: tear down mesh, reconnect with backoff
      this.teardownPeers()
      setTimeout(() => this.connectWs(), 1500)
    }
  }

  private send(msg: object) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg))
  }

  private async onMessage(msg: any) {
    switch (msg.t) {
      case 'joined':
        this.localId = msg.id
        this.localParticipant.id = msg.id
        this.localParticipant.isHost = msg.isHost
        for (const peer of msg.peers) this.createPeer(peer)
        this.broadcastState()
        this.emit('update')
        break
      case 'peer-joined':
        this.createPeer(msg.peer)
        this.broadcastState()
        this.emit('update')
        break
      case 'peer-left': {
        const p = this.peers.get(msg.id)
        p?.pc.close()
        this.peers.delete(msg.id)
        this.updateSendParams()
        this.emit('update')
        break
      }
      case 'signal':
        await this.onSignal(msg.from, msg.data)
        break
      case 'state': {
        const p = this.peers.get(msg.from)
        if (p) {
          p.participant.mic = !!msg.state.mic
          p.participant.cam = !!msg.state.cam
          this.emit('update')
        }
        break
      }
      case 'mute':
        this.setMicEnabled(false)
        this.emit('muted-by-host', msg.by)
        break
      case 'full':
        this.emit('full')
        break
    }
  }

  private createPeer(info: { id: string; name: string; isHost: boolean }) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers })
    const peer: Peer = {
      pc,
      // deterministic politeness per pair (perfect negotiation)
      polite: this.localId > info.id,
      makingOffer: false,
      ignoreOffer: false,
      participant: { id: info.id, name: info.name, isHost: info.isHost, isLocal: false, stream: new MediaStream(), mic: true, cam: true },
    }
    this.peers.set(info.id, peer)

    for (const track of this.localParticipant.stream?.getTracks() ?? [])
      pc.addTrack(track, this.localParticipant.stream!)

    // VP9 ~30% better quality/bit than VP8/H.264, but software-encoded: prefer it only for
    // small calls (≤2 remote peers at connect). Negotiation intersects with the other side's
    // codecs, so unsupported browsers silently keep their default — nothing can break.
    if ('setCodecPreferences' in RTCRtpTransceiver.prototype && this.peers.size <= 2) {
      const codecs = RTCRtpSender.getCapabilities?.('video')?.codecs
      if (codecs) {
        const rank = (m: string) => (m === 'video/vp9' ? 0 : m === 'video/h264' ? 1 : 2)
        const sorted = [...codecs].sort((a, b) => rank(a.mimeType.toLowerCase()) - rank(b.mimeType.toLowerCase()))
        for (const t of pc.getTransceivers())
          if (t.sender.track?.kind === 'video') {
            try {
              t.setCodecPreferences(sorted)
            } catch {}
          }
      }
    }

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true
        await pc.setLocalDescription()
        this.send({ t: 'signal', to: info.id, data: { description: pc.localDescription } })
      } catch (e) {
        console.error(e)
      } finally {
        peer.makingOffer = false
      }
    }
    pc.onicecandidate = ({ candidate }) => this.send({ t: 'signal', to: info.id, data: { candidate } })
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') pc.restartIce()
      this.emit('update')
    }
    pc.ontrack = ({ track }) => {
      peer.participant.stream!.addTrack(track)
      track.onended = () => peer.participant.stream!.removeTrack(track)
      this.emit('update')
    }
    this.updateSendParams()
  }

  private async onSignal(from: string, data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) {
    const peer = this.peers.get(from)
    if (!peer) return
    const { pc } = peer
    try {
      if (data.description) {
        const collision = data.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable')
        peer.ignoreOffer = !peer.polite && collision
        if (peer.ignoreOffer) return
        await pc.setRemoteDescription(data.description)
        if (data.description.type === 'offer') {
          await pc.setLocalDescription()
          this.send({ t: 'signal', to: from, data: { description: pc.localDescription } })
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate)
        } catch (e) {
          if (!peer.ignoreOffer) throw e
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Outgoing quality ladder. Desktop: 1080p-capable up to 4 people — congestion control
  // still lowers actual bitrate below these caps when an uplink can't sustain them.
  // Touch devices: scale down aggressively; N-1 encodes on a phone is thermal suicide.
  private updateSendParams() {
    const n = Math.max(1, this.peers.size)
    const coarse = matchMedia('(pointer: coarse)').matches
    const [maxBitrate, scale] = coarse
      ? n <= 1 ? [2_500_000, 1] : n === 2 ? [1_200_000, 1.5] : n === 3 ? [800_000, 2] : [500_000, 2]
      : n <= 1 ? [6_000_000, 1] : n === 2 ? [3_500_000, 1] : n === 3 ? [2_500_000, 1] : [1_500_000, 1.5]
    for (const { pc } of this.peers.values()) {
      for (const sender of pc.getSenders()) {
        if (sender.track?.kind !== 'video') continue
        const params = sender.getParameters()
        if (!params.encodings?.length) params.encodings = [{}]
        params.encodings[0].maxBitrate = maxBitrate
        params.encodings[0].scaleResolutionDownBy = scale
        params.degradationPreference = 'maintain-framerate'
        sender.setParameters(params).catch(() => {})
      }
    }
  }

  private broadcastState() {
    this.send({ t: 'state', state: { mic: this.localParticipant.mic, cam: this.localParticipant.cam } })
  }

  get hasMic() {
    return !!this.localParticipant.stream?.getAudioTracks().length
  }
  get hasCam() {
    return !!this.localParticipant.stream?.getVideoTracks().length
  }

  setMicEnabled(on: boolean) {
    if (on && !this.hasMic) return
    this.localParticipant.mic = on
    this.localParticipant.stream?.getAudioTracks().forEach((t) => (t.enabled = on))
    this.broadcastState()
    this.emit('update')
  }

  setCameraEnabled(on: boolean) {
    if (on && !this.hasCam) return
    this.localParticipant.cam = on
    this.localParticipant.stream?.getVideoTracks().forEach((t) => (t.enabled = on))
    this.broadcastState()
    this.emit('update')
  }

  // host-only: ask a peer to mute itself (P2P — their client enforces it)
  mutePeer(id: string) {
    if (this.localParticipant.isHost) this.send({ t: 'mute', to: id })
  }

  // swap camera (mobile flip / device picker) without renegotiating
  async replaceVideoTrack(constraints: MediaTrackConstraints) {
    const stream = this.localParticipant.stream
    if (!stream) return
    const old = stream.getVideoTracks()[0]
    const fresh = await navigator.mediaDevices.getUserMedia({ video: constraints })
    const track = fresh.getVideoTracks()[0]
    track.enabled = this.localParticipant.cam
    for (const peer of this.peers.values()) {
      const sender = peer.pc.getSenders().find((s) => s.track?.kind === 'video')
      await sender?.replaceTrack(track)
    }
    if (old) {
      stream.removeTrack(old)
      old.stop()
    }
    stream.addTrack(track)
    this.emit('update')
  }

  private teardownPeers() {
    for (const p of this.peers.values()) p.pc.close()
    this.peers.clear()
    this.emit('update')
  }

  leave() {
    this.closed = true
    this.teardownPeers()
    this.ws?.close()
    this.localParticipant.stream?.getTracks().forEach((t) => t.stop())
    this.emit('ended')
  }
}
