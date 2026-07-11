import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Backdrop, ThemeToggle, nav } from '../App'
import { listDevices, useAudioLevel, useStreamRef } from '../lib/media'
import { Cam, CamOff, Mic, MicOff } from '../icons'
import Call from './Call'

type Stage = 'prejoin' | 'call' | 'ended' | 'full'

export default function Room({ roomId }: { roomId: string }) {
  const [stage, setStage] = useState<Stage>('prejoin')
  const [joinCfg, setJoinCfg] = useState<{ stream: MediaStream | null; name: string; mic: boolean; cam: boolean } | null>(null)

  if (stage === 'full') return <EndCard title="This meeting is full" sub="Meetings support up to 6 people." roomId={roomId} onRejoin={() => setStage('prejoin')} />
  if (stage === 'ended') return <EndCard title="You left the meeting" roomId={roomId} onRejoin={() => setStage('prejoin')} />
  if (stage === 'call' && joinCfg)
    return <Call roomId={roomId} {...joinCfg} onEnded={() => setStage('ended')} onFull={() => setStage('full')} />
  return (
    <PreJoin
      roomId={roomId}
      onJoin={(cfg) => {
        setJoinCfg(cfg)
        setStage('call')
      }}
    />
  )
}

function EndCard({ title, sub, roomId, onRejoin }: { title: string; sub?: string; roomId: string; onRejoin: () => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 px-6 text-center">
      <Backdrop />
      <ThemeToggle />
      <div className="rise">
        <h1 className="display text-4xl">{title}</h1>
        {sub && <p className="mt-3 text-mut">{sub}</p>}
        <p className="mt-2 text-sm text-faint">{roomId}</p>
      </div>
      <div className="rise flex gap-3" style={{ animationDelay: '80ms' }}>
        <button onClick={onRejoin} className="pressable glow rounded-2xl bg-accent px-6 py-3 font-semibold text-white">Rejoin</button>
        <button onClick={() => nav('/')} className="pressable glass rounded-2xl px-6 py-3 font-semibold">Home</button>
      </div>
    </div>
  )
}

function PreJoin({ roomId, onJoin }: { roomId: string; onJoin: (cfg: { stream: MediaStream | null; name: string; mic: boolean; cam: boolean }) => void }) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<'denied' | 'none' | null>(null)
  const [mic, setMic] = useState(true)
  const [cam, setCam] = useState(true)
  const [name, setName] = useState(localStorage.getItem('name') ?? '')
  const [devices, setDevices] = useState<{ mics: MediaDeviceInfo[]; cams: MediaDeviceInfo[] }>({ mics: [], cams: [] })
  const joined = useRef(false)
  const videoRef = useStreamRef(stream)
  const level = useAudioLevel(stream, mic)

  const acquire = async (audio: MediaTrackConstraints | boolean, video: MediaTrackConstraints | boolean) => {
    setError(null)
    try {
      // some engines/webviews hang getUserMedia indefinitely — don't dead-end the lobby
      const s = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          audio: audio === true ? { echoCancellation: true, noiseSuppression: true } : audio,
          video: video === true ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : video,
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), 10000)),
      ])
      setStream((old) => {
        old?.getTracks().forEach((t) => t.stop())
        return s
      })
      setDevices(await listDevices()) // labels only populate after permission
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') setError('denied')
      else setError('none')
    }
  }

  useEffect(() => {
    acquire(true, true)
    const refresh = () => listDevices().then(setDevices)
    navigator.mediaDevices.addEventListener?.('devicechange', refresh)
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', refresh)
  }, [])

  // stop tracks if the user navigates away without joining
  useEffect(() => () => {
    if (!joined.current) streamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])
  const streamRef = useRef(stream)
  streamRef.current = stream

  const switchDevice = (kind: 'audio' | 'video', deviceId: string) => {
    const a = kind === 'audio' ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true } : true
    const v = kind === 'video' ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : true
    acquire(a, v)
  }

  const toggle = (kind: 'mic' | 'cam') => {
    const on = kind === 'mic' ? !mic : !cam
    kind === 'mic' ? setMic(on) : setCam(on)
    const tracks = kind === 'mic' ? stream?.getAudioTracks() : stream?.getVideoTracks()
    tracks?.forEach((t) => (t.enabled = on))
  }

  // join is allowed even with devices blocked/missing — recv-only, like Meet
  const join = () => {
    if (!stream && !error) return
    joined.current = true
    localStorage.setItem('name', name.trim())
    onJoin({ stream, name: name.trim() || 'Guest', mic: mic && !!stream, cam: cam && !!stream })
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center gap-6 px-4 py-8 lg:flex-row lg:gap-12">
      <Backdrop />
      <ThemeToggle />
      {/* preview */}
      <div className="rise relative aspect-video w-full max-w-xl overflow-hidden rounded-3xl bg-surface shadow-2xl shadow-black/20">
        {stream && cam ? (
          <video ref={videoRef} autoPlay playsInline muted className="mirror absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-faint">
            {error === 'denied' ? (
              <div className="px-8 text-center">
                <p className="font-semibold text-ink">Camera and microphone are blocked</p>
                <p className="mt-1 text-sm">Allow access in your browser's site settings, then{' '}
                  <button onClick={() => acquire(true, true)} className="text-accent underline">try again</button>.
                </p>
              </div>
            ) : error === 'none' ? (
              <div className="px-8 text-center">
                <p className="font-semibold text-ink">No camera or microphone found</p>
                <button onClick={() => acquire(true, true)} className="mt-1 text-sm text-accent underline">Try again</button>
              </div>
            ) : (
              <p>Camera is off</p>
            )}
          </div>
        )}
        {/* mic level dot */}
        {stream && (
          <div className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/50">
            <div
              className="rounded-full bg-accent transition-all duration-100"
              style={{ width: 6 + level * 14, height: 6 + level * 14, opacity: mic ? 1 : 0.25 }}
            />
          </div>
        )}
        {/* toggles over preview */}
        {stream && (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-3">
            <RoundBtn label="Toggle microphone" on={mic} onClick={() => toggle('mic')} onIcon={<Mic />} offIcon={<MicOff />} />
            <RoundBtn label="Toggle camera" on={cam} onClick={() => toggle('cam')} onIcon={<Cam />} offIcon={<CamOff />} />
          </div>
        )}
      </div>

      {/* join column */}
      <div className="rise flex w-full max-w-sm flex-col items-center gap-4" style={{ animationDelay: '80ms' }}>
        <h1 className="display text-3xl">Ready to join?</h1>
        <p className="-mt-2 text-sm text-faint">{roomId}</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && join()}
          placeholder="Your name"
          className="glass w-full rounded-2xl px-4 py-3.5 text-center outline-none transition-colors placeholder:text-faint focus:border-accent/50"
        />
        {devices.mics.length > 0 && (
          <div className="flex w-full flex-col gap-2">
            <DeviceSelect label="Microphone" items={devices.mics} onChange={(id) => switchDevice('audio', id)} />
            <DeviceSelect label="Camera" items={devices.cams} onChange={(id) => switchDevice('video', id)} />
          </div>
        )}
        <button
          onClick={join}
          disabled={!stream && !error}
          className="pressable glow w-full rounded-2xl bg-accent px-6 py-4 text-lg font-semibold text-white disabled:opacity-40"
        >
          {stream ? 'Join now' : error ? 'Join without camera and mic' : 'Join now'}
        </button>
      </div>
    </div>
  )
}

function RoundBtn({ on, onClick, onIcon, offIcon, label }: { on: boolean; onClick: () => void; onIcon: ReactNode; offIcon: ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`pressable flex h-12 w-12 items-center justify-center rounded-full ${on ? 'glass-dark' : 'bg-red-500 text-white'}`}
    >
      {on ? onIcon : offIcon}
    </button>
  )
}

function DeviceSelect({ label, items, onChange }: { label: string; items: MediaDeviceInfo[]; onChange: (id: string) => void }) {
  if (items.length === 0) return null
  return (
    <select
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="glass w-full appearance-none rounded-xl px-3 py-2.5 text-sm text-mut outline-none"
    >
      {items.map((d, i) => (
        <option key={d.deviceId} value={d.deviceId}>
          {d.label || `${label} ${i + 1}`}
        </option>
      ))}
    </select>
  )
}
