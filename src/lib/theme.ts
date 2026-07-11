import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'
const listeners = new Set<() => void>()
const systemLight = matchMedia('(prefers-color-scheme: light)')

export function currentTheme(): Theme {
  const saved = localStorage.getItem('theme')
  if (saved === 'light' || saved === 'dark') return saved
  return systemLight.matches ? 'light' : 'dark'
}

function apply() {
  const t = currentTheme()
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#f4f4f6' : '#09090b')
  listeners.forEach((fn) => fn())
}

export function toggleTheme() {
  localStorage.setItem('theme', currentTheme() === 'light' ? 'dark' : 'light')
  apply()
}

systemLight.addEventListener('change', apply)
apply() // set on load, before first paint

export function useTheme(): Theme {
  return useSyncExternalStore(
    (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    currentTheme,
  )
}
