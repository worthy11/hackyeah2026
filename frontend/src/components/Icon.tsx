import type { ReactNode } from 'react'

export type IconName =
  | 'dashboard'
  | 'vocabulary'
  | 'conversation'
  | 'translate'
  | 'materials'
  | 'upload'
  | 'info'
  | 'bell'
  | 'chevron'
  | 'repeat'
  | 'slow'
  | 'play'
  | 'pause'
  | 'check'
  | 'arrow'

const iconShapes: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
    </>
  ),
  vocabulary: (
    <>
      <path d="M4 5.5h16M4 12h16M4 18.5h10" />
      <path d="m7 3.5-3 2 3 2M17 10l3 2-3 2" />
    </>
  ),
  conversation: (
    <>
      <path d="M20 11.5a6.5 6.5 0 0 1-6.5 6.5H8l-4 3v-6.5A6.5 6.5 0 0 1 10.5 8H14a6 6 0 0 1 6 3.5Z" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </>
  ),
  translate: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 12h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18M7 7h5M9.5 5v2" />
    </>
  ),
  materials: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22V5.5Z" />
      <path d="M4 17a2.5 2.5 0 0 1 2.5-2.5H20M8 7h8" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  bell: <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
  chevron: <path d="m7 10 5 5 5-5" />,
  repeat: (
    <>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
    </>
  ),
  slow: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2M3 12h2" />
    </>
  ),
  play: <path d="m9 6 10 6-10 6V6Z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconShapes[name]}
    </svg>
  )
}