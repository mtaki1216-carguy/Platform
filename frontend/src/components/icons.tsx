import type { ReactNode } from 'react'

/** 線画アイコン。外部アセットを持たないため SVG を直接描く（24px グリッド・線幅 1.8） */
function Icon({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

type IconProps = { className?: string }

export const IconDashboard = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
    <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
    <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
  </Icon>
)

export const IconWallet = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a1.5 1.5 0 0 1 1.5 1.5V9" />
    <path d="M4 7.5V17a2 2 0 0 0 2 2h12.5a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5Z" />
    <circle cx="15.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconWrench = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M14.5 6.5a4 4 0 0 0-5.2 5.2L4 17v3h3l5.3-5.3a4 4 0 0 0 5.2-5.2l-2.5 2.5-2.5-.5-.5-2.5 2.5-2.5Z" />
  </Icon>
)

export const IconFlag = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M5 21V4" />
    <path d="M5 4.5h10.5l-1.8 3.5 1.8 3.5H5" />
  </Icon>
)

export const IconUsers = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6" />
    <path d="M18 14.2A6.5 6.5 0 0 1 21.5 20" />
  </Icon>
)

export const IconMenu = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M4 7h16" />
    <path d="M4 12h10" />
    <path d="M4 17h16" />
  </Icon>
)

export const IconCoins = ({ className }: IconProps) => (
  <Icon className={className}>
    <ellipse cx="12" cy="6.5" rx="7" ry="3" />
    <path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    <path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
  </Icon>
)

export const IconHandCoins = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 3v11" />
    <path d="M15 6.5c-.6-1-1.7-1.5-3-1.5s-3 .7-3 2.2c0 3 6 1.6 6 4.6 0 1.5-1.5 2.2-3 2.2s-2.6-.6-3.2-1.8" />
    <path d="M3 18h4.5a3 3 0 0 1 2.2 1l.8.8h5.5a2 2 0 0 0 1.7-1l3.3-5.3" />
  </Icon>
)

export const IconBalance = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 4v16" />
    <path d="M7 20h10" />
    <path d="M5 8h14" />
    <path d="M5 8l-2.5 6a3 3 0 0 0 5 0L5 8Z" />
    <path d="M19 8l-2.5 6a3 3 0 0 0 5 0L19 8Z" />
  </Icon>
)
