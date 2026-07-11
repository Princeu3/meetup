import { useCallback, useEffect, useState } from 'react'

// Live mic level 0..1 from a stream. One utility serves the lobby meter and in-call speaking rings.
export function useAudioLevel(stream: MediaStream | null, enabled = true) {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    if (!stream || !enabled || stream.getAudioTracks().length === 0) {
      setLevel(0)
      return
    }
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    let src: MediaStreamAudioSourceNode
    try {
      src = ctx.createMediaStreamSource(stream)
    } catch {
      ctx.close()
      return
    }
    src.connect(analyser) // not connected to destination — analysis only, no playback
    const data = new Uint8Array(analyser.fftSize)
    let raf = 0
    let last = 0
    const loop = () => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / data.length)
      // throttle React updates to ~10/s, with hysteresis-friendly smoothing
      const now = performance.now()
      if (now - last > 100) {
        last = now
        setLevel((prev) => prev * 0.6 + Math.min(1, rms * 4) * 0.4)
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      src.disconnect()
      ctx.close()
    }
  }, [stream, enabled])
  return level
}

// Keep the screen awake during a call (mobile).
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    const acquire = () => navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {})
    acquire()
    const onVis = () => document.visibilityState === 'visible' && acquire()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      lock?.release().catch(() => {})
    }
  }, [active])
}

export async function listDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return {
    mics: devices.filter((d) => d.kind === 'audioinput'),
    cams: devices.filter((d) => d.kind === 'videoinput'),
  }
}

// Attach a MediaStream to a <video>. Callback ref, not useRef+useEffect: the video element
// unmounts/remounts on camera toggle, and an effect keyed on `stream` won't re-attach to the
// new element (stream identity unchanged) — the preview stays black until refresh.
export function useStreamRef(stream: MediaStream | null) {
  return useCallback(
    (el: HTMLVideoElement | null) => {
      if (el && el.srcObject !== stream) {
        el.srcObject = stream
        el.play().catch(() => {}) // iOS may reject before user gesture; retried by autoplay
      }
    },
    [stream],
  )
}
