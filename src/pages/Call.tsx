import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { MeetRoom, type Participant } from '../lib/room'
import { camConstraints, useAudioLevel, useStreamRef, useWakeLock } from '../lib/media'
import { Cam, CamOff, Check, Copy, Flip, Hang, Mic, MicOff, Users } from '../icons'

type Props = {
  roomId: string
  stream: MediaStream | null
  name: string
  mic: boolean
  cam: boolean
  onEnded: () => void
  onFull: () => void
}

export default function Call({ roomId, stream, name, mic, cam, onEnded, onFull }: Props) {
  const roomRef = useRef<MeetRoom | null>(null)
  if (!roomRef.current) roomRef.current = new MeetRoom()
  const room = roomRef.current
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [toast, setToast] = useState('')
  const [panel, setPanel] = useState(false)
  const [chrome, setChrome] = useState(true)
  const [portrait, setPortrait] = useState(matchMedia('(orientation: portrait)').matches)

  const toastTimer = useRef(0)
  const showToast = (msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3500)
  }

  // auto-hide chrome after idle (Meet-style immersion)
  const idleTimer = useRef(0)
  const poke = () => {
    setChrome(true)
    clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setChrome(false), 3500)
  }

  useEffect(() => {
    const offs = [
      room.on('update', force),
      room.on('full', onFull),
      room.on('muted-by-host', (by) => showToast(`${by} muted your microphone`)),
    ]
    room.join(roomId, name, stream, { mic, cam, hostToken: sessionStorage.getItem(`host:${roomId}`) ?? undefined })

    const mq = matchMedia('(orientation: portrait)')
    const onMq = () => setPortrait(mq.matches)
    mq.addEventListener('change', onMq)

    // any interaction reveals chrome + retries blocked autoplay (iOS)
    const onActive = () => {
      poke()
      document.querySelectorAll('video').forEach((v) => v.paused && v.play().catch(() => {}))
    }
    document.addEventListener('pointerdown', onActive)
    document.addEventListener('pointermove', poke)

    // keyboard: m = mic, v = camera
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'm') room.setMicEnabled(!room.localParticipant.mic)
      if (e.key === 'v') room.setCameraEnabled(!room.localParticipant.cam)
      poke()
    }
    document.addEventListener('keydown', onKey)
    poke()

    return () => {
      offs.forEach((f) => f())
      mq.removeEventListener('change', onMq)
      document.removeEventListener('pointerdown', onActive)
      document.removeEventListener('pointermove', poke)
      document.removeEventListener('keydown', onKey)
      clearTimeout(idleTimer.current)
      room.leave()
    }
  }, [])

  useWakeLock(true)

  const ps = room.participants
  const me = room.localParticipant
  const n = ps.length
  const alone = n <= 1
  const cols = n <= 1 ? 1 : n === 2 ? (portrait ? 1 : 2) : n <= 4 ? 2 : portrait ? 2 : 3
  const showChrome = chrome || panel || alone

  const leave = () => {
    room.leave()
    onEnded()
  }

  const copyLink = async () => {
    const url = location.href
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      navigator.share({ url }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(url).catch(() => {})
      showToast('Link copied')
    }
  }

  const flipCamera = () => {
    const track = me.stream?.getVideoTracks()[0]
    const facing = track?.getSettings().facingMode
    room
      .replaceVideoTrack(camConstraints({ facingMode: facing === 'environment' ? 'user' : 'environment' }))
      .catch(() => showToast('Could not switch camera'))
  }

  const isTouch = matchMedia('(pointer: coarse)').matches

  return (
    <div className="force-dark relative bg-bg text-ink" style={{ height: '100dvh' }}>
      {/* grid — full bleed; chrome overlays it */}
      <div
        className="grid h-full min-h-0 gap-2 p-2 transition-[padding] duration-300"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          paddingTop: showChrome ? 'calc(max(0.75rem, env(safe-area-inset-top)) + 3.5rem)' : undefined,
          paddingBottom: showChrome ? 'calc(max(1rem, env(safe-area-inset-bottom)) + 4.5rem)' : undefined,
        }}
      >
        {ps.map((p) => (
          <Tile
            key={p.id || 'me'}
            p={p}
            // mirror self-view only for the front camera — rear cam isn't a mirror
            mirror={p.isLocal && me.stream?.getVideoTracks()[0]?.getSettings().facingMode !== 'environment'}
            canMute={me.isHost && !p.isLocal && p.mic}
            onMute={() => room.mutePeer(p.id)}
          />
        ))}
      </div>

      {/* top bar */}
      <div
        className={`chrome absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-3 ${showChrome ? '' : 'chrome-hidden'}`}
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <button onClick={copyLink} aria-label="Copy meeting link" className="pressable glass-dark flex items-center gap-2 rounded-full px-4 py-2 text-sm text-mut">
          {roomId} <Copy size={15} />
        </button>
        <button onClick={() => setPanel(!panel)} aria-label="Show participants" className="pressable glass-dark flex items-center gap-2 rounded-full px-4 py-2 text-sm text-mut">
          <Users size={17} /> {n}
        </button>
      </div>

      {/* alone: share card */}
      {alone && (
        <div className="rise pointer-events-none absolute inset-0 flex items-center justify-center px-6">
          <div className="glass-dark pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-3xl p-6 text-center shadow-2xl shadow-black/40">
            <p className="font-semibold">You're the only one here</p>
            <p className="text-sm text-mut">Share this link with people you want in the meeting</p>
            <button onClick={copyLink} className="pressable mt-1 flex max-w-full items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm">
              <span className="truncate">{location.host}/r/{roomId}</span>
              <Copy size={15} />
            </button>
          </div>
        </div>
      )}

      {/* control bar */}
      <div
        className={`chrome absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-3 px-4 pt-2 ${showChrome ? '' : 'chrome-hidden'}`}
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <CtlBtn
          label={me.mic ? 'Mute (m)' : 'Unmute (m)'}
          on={me.mic}
          onClick={() => (room.hasMic ? room.setMicEnabled(!me.mic) : showToast('No microphone available'))}
          onIcon={<Mic />}
          offIcon={<MicOff />}
        />
        <CtlBtn
          label={me.cam ? 'Camera off (v)' : 'Camera on (v)'}
          on={me.cam}
          onClick={() => (room.hasCam ? room.setCameraEnabled(!me.cam) : showToast('No camera available'))}
          onIcon={<Cam />}
          offIcon={<CamOff />}
        />
        {isTouch && (
          <button onClick={flipCamera} aria-label="Flip camera" className="pressable glass-dark flex h-14 w-14 items-center justify-center rounded-full">
            <Flip />
          </button>
        )}
        <button onClick={leave} aria-label="Leave call" className="pressable flex h-14 w-20 items-center justify-center rounded-full bg-red-500 text-white">
          <Hang />
        </button>
      </div>

      {/* participants panel */}
      {panel && (
        <div className="glass-dark rise fixed right-3 top-16 z-20 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl p-2">
          <p className="px-3 py-2 text-sm font-semibold text-mut">In this call</p>
          {ps.map((p) => (
            <div key={p.id || 'me'} className="flex items-center gap-3 rounded-xl px-3 py-2">
              <Avatar name={p.name} size={32} />
              <span className="flex-1 truncate text-sm">
                {p.name}
                {p.isLocal && ' (you)'}
                {p.isHost && <span className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 text-xs text-mut">host</span>}
              </span>
              <span className="text-faint">{p.mic ? <Mic size={17} /> : <MicOff size={17} />}</span>
              {me.isHost && !p.isLocal && p.mic && (
                <button onClick={() => room.mutePeer(p.id)} className="pressable rounded-lg bg-white/10 px-2 py-1 text-xs">
                  Mute
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* toast */}
      {toast && (
        <div className="glass-dark rise fixed bottom-28 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2.5 text-sm">
          <Check size={16} /> {toast}
        </div>
      )}
    </div>
  )
}

function CtlBtn({ on, onClick, onIcon, offIcon, label }: { on: boolean; onClick: () => void; onIcon: ReactNode; offIcon: ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`pressable flex h-14 w-14 items-center justify-center rounded-full ${on ? 'glass-dark' : 'bg-red-500 text-white'}`}
    >
      {on ? onIcon : offIcon}
    </button>
  )
}

function Avatar({ name, size }: { name: string; size: number }) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `oklch(0.45 0.09 ${hue})` }}
    >
      {(name[0] || '?').toUpperCase()}
    </div>
  )
}

function Tile({ p, mirror, canMute, onMute }: { p: Participant; mirror: boolean; canMute: boolean; onMute: () => void }) {
  const videoRef = useStreamRef(p.stream)
  const level = useAudioLevel(p.isLocal ? null : p.stream, p.mic) // local ring would need a cloned stream; skip
  const speaking = !p.isLocal && p.mic && level > 0.18
  const hasVideo = p.cam && (p.stream?.getVideoTracks().length ?? 0) > 0

  return (
    <div className={`tile-in relative min-h-0 overflow-hidden rounded-2xl bg-surface transition-shadow duration-200 ${speaking ? 'speaking' : ''}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={p.isLocal}
        className={`absolute inset-0 h-full w-full object-cover ${mirror ? 'mirror' : ''} ${hasVideo ? '' : 'invisible'}`}
      />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar name={p.name} size={72} />
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/45 px-2 py-1 text-xs text-white">
        {!p.mic && <span className="text-red-400"><MicOff size={13} /></span>}
        <span className="max-w-40 truncate">{p.isLocal ? 'You' : p.name}</span>
      </div>
      {canMute && (
        <button onClick={onMute} className="pressable absolute right-2 top-2 rounded-lg bg-black/45 px-2.5 py-1.5 text-xs text-white opacity-80">
          Mute
        </button>
      )}
    </div>
  )
}
