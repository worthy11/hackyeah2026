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
  // category icons
  | 'hand'
  | 'people'
  | 'eye'
  | 'heart'
  | 'map'
  | 'food'
  | 'filter'
  | 'flip-camera'
  | 'clock'
  | 'home'
  | 'palette'
  | 'hash'
  | 'cloud'
  | 'bag'
  | 'book'
  | 'health'

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
      <circle cx="9.5" cy="13" r="0.5" fill="currentColor" /><circle cx="12" cy="13" r="0.5" fill="currentColor" /><circle cx="14.5" cy="13" r="0.5" fill="currentColor" />
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

  // category icons
  hand: (
    <>
      <path d="M18 11V7a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
      <path d="M14 10V5a2 2 0 0 0-2-2 2 2 0 0 0-2 2v3" />
      <path d="M10 9.5V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v9" />
      <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8 2 2 0 1 1 4 0" />
    </>
  ),
  people: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  heart: (
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z" />
  ),
  map: (
    <>
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </>
  ),
  food: (
    <>
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8Z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </>
  ),
  filter: (
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />
  ),
  'flip-camera': (
    <>
      <path d="M20 7h-3.5l-1.5-2h-6L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z" />
      <path d="M9 12.5a3 3 0 0 0 5.83 1M15 12.5a3 3 0 0 0-5.83-1" />
      <path d="m9.17 11.5-1-1.5-1 1.5M14.83 13.5l1 1.5 1-1.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  home: (
    <>
      <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" />
      <path d="M9 21V12h6v9" />
    </>
  ),
  palette: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="13.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12 21a3 3 0 0 1-3-3c0-1.5 3-5 3-5s3 3.5 3 5a3 3 0 0 1-3 3Z" />
    </>
  ),
  hash: (
    <path d="M4 9h16M4 15h16M10 3l-2 18M16 3l-2 18" />
  ),
  cloud: (
    <>
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 0 1 0 9Z" />
    </>
  ),
  bag: (
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      <line x1="8" y1="7" x2="16" y2="7" />
      <line x1="8" y1="11" x2="12" y2="11" />
    </>
  ),
  health: (
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  ),
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
