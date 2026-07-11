import { useEffect, useState } from 'react'
import { MeshGradient } from '@paper-design/shaders-react'
import Room from './pages/Room'
import { Link, Moon, Sun } from './icons'
import { toggleTheme, useTheme } from './lib/theme'

// ponytail: two routes — history API beats a router dep
export function nav(to: string) {
  history.pushState(null, '', to)
  dispatchEvent(new PopStateEvent('popstate'))
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

const MESH = {
  dark: ['#07070c', '#141233', '#0c2547', '#2a1650'],
  light: ['#f4f4f6', '#dfe6f8', '#e9defa', '#d3e4f6'],
}

// Shared shader backdrop — home, lobby, end screens. Never in-call (GPU belongs to encoders there).
export function Backdrop() {
  const theme = useTheme()
  const edge = theme === 'light' ? '244,244,246' : '7,7,10'
  return (
    <div className="fixed inset-0 -z-10" aria-hidden>
      <MeshGradient
        colors={MESH[theme]}
        distortion={0.9}
        swirl={0.6}
        speed={reducedMotion ? 0 : 0.12}
        style={{ width: '100%', height: '100%' }}
      />
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(ellipse at 50% 40%, transparent 0%, rgba(${edge},0.45) 70%, rgba(${edge},0.8) 100%)` }}
      />
    </div>
  )
}

export function ThemeToggle() {
  const theme = useTheme()
  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle light or dark mode"
      className="pressable glass fixed right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full text-mut"
      style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
    >
      {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  )
}

export default function App() {
  const [path, setPath] = useState(location.pathname)
  useEffect(() => {
    const f = () => setPath(location.pathname)
    addEventListener('popstate', f)
    return () => removeEventListener('popstate', f)
  }, [])

  const m = path.match(/^\/r\/([\w-]+)$/)
  if (m) return <Room roomId={m[1]} key={m[1]} />
  return <Home />
}

function Home() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    try {
      const { roomId, hostToken } = await fetch('/api/rooms', { method: 'POST' }).then((r) => r.json())
      sessionStorage.setItem(`host:${roomId}`, hostToken)
      nav(`/r/${roomId}`)
    } finally {
      setBusy(false)
    }
  }

  const join = () => {
    const id = code.trim().match(/([\w]{2,4}-[\w]{2,5}-[\w]{2,4})/)?.[1] ?? code.trim()
    if (id) nav(`/r/${id}`)
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-12 px-6">
      <Backdrop />
      <ThemeToggle />
      <div className="rise text-center">
        <h1 className="display text-6xl sm:text-7xl">Meetup</h1>
        <p className="mt-4 text-lg text-mut sm:text-xl">
          Video calls that just work.
          <br className="sm:hidden" /> No account needed.
        </p>
      </div>
      <div className="rise flex w-full max-w-sm flex-col gap-3" style={{ animationDelay: '80ms' }}>
        <button
          onClick={create}
          disabled={busy}
          className="pressable glow rounded-2xl bg-accent px-6 py-4 text-lg font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'New meeting'}
        </button>
        <div className="flex gap-2">
          <div className="glass flex flex-1 items-center gap-2.5 rounded-2xl px-4 transition-colors focus-within:border-accent/50">
            <span className="text-faint"><Link size={18} /></span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              placeholder="Enter a code or link"
              className="w-full bg-transparent py-4 outline-none placeholder:text-faint"
            />
          </div>
          {code.trim() && (
            <button onClick={join} className="pressable rounded-2xl px-5 font-semibold text-accent">
              Join
            </button>
          )}
        </div>
      </div>
      <p className="rise text-sm text-faint" style={{ animationDelay: '160ms' }}>
        Up to 6 people&ensp;·&ensp;Peer-to-peer&ensp;·&ensp;Encrypted
      </p>
    </div>
  )
}
