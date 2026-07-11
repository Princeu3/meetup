import type { SVGProps } from 'react'

// ponytail: hand-rolled icon set — 10 icons don't justify an icon library
const I = ({ d, size = 22, ...p }: { d: string; size?: number } & SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d={d} />
  </svg>
)

type P = { size?: number }
export const Mic = (p: P) => <I d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Zm7 9a7 7 0 0 1-14 0m7 7v3" {...p} />
export const MicOff = (p: P) => <I d="M3 3l18 18M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 5.1 2.1M19 11a7 7 0 0 1-1.6 4.4M5 11a7 7 0 0 0 11 5.7M12 18v3" {...p} />
export const Cam = (p: P) => <I d="M3.5 7A1.5 1.5 0 0 1 5 5.5h9A1.5 1.5 0 0 1 15.5 7v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17V7Zm12 3.5 4-2.5v8l-4-2.5" {...p} />
export const CamOff = (p: P) => <I d="M3 3l18 18M15.5 13.5V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17V7A1.5 1.5 0 0 1 5 5.5h1.5m4 0H14A1.5 1.5 0 0 1 15.5 7v3l4-2.5v8" {...p} />
export const Flip = (p: P) => <I d="M4 9a8 8 0 0 1 14-3m2-3v6h-6M20 15a8 8 0 0 1-14 3m-2 3v-6h6" {...p} />
export const Users = (p: P) => <I d="M16 19a4 4 0 0 0-8 0M12 5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm7 14a4 4 0 0 0-3-3.9M17 5.5a3.5 3.5 0 0 1 0 6.5M5 19a4 4 0 0 1 3-3.9M7 5.5a3.5 3.5 0 0 0 0 6.5" {...p} />
export const Hang = (p: P) => <I d="M4 14c4.5-4 11.5-4 16 0l-2.5 3-3.5-1.7v-2.6a10 10 0 0 0-4 0v2.6L6.5 17 4 14Z" {...p} />
export const Copy = (p: P) => <I d="M9 9h10v12H9V9Zm-4 8V3h10" {...p} />
export const Check = (p: P) => <I d="M4 12.5 9.5 18 20 6" {...p} />
export const Link = (p: P) => <I d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.5M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5" {...p} />
export const Sun = (p: P) => <I d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0-6v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" {...p} />
export const Moon = (p: P) => <I d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" {...p} />
