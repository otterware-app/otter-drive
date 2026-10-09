import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { SettingsPageContainer, SettingsSection } from './settings-ui'

type Scheme = 'system' | 'light' | 'dark'

type MiniColors = {
  canvas: string
  sidebar: string
  line: string
  selected: string
  text: string
}

// The palettes' own colors (styles.css), for the miniature windows.
const LIGHT: MiniColors = {
  canvas: '#ffffff',
  sidebar: '#f9f9f9',
  line: '#e8e8e8',
  selected: '#e8e8e8',
  text: '#5d5d5d',
}
const DARK: MiniColors = {
  canvas: '#181818',
  sidebar: '#202020',
  line: '#2c2c2c',
  selected: '#333333',
  text: '#a3a3a3',
}

/** A tiny Drive window (rail, list rows, a page) in one palette (Otter Mail's). */
function MiniWindow({ colors }: { colors: MiniColors }) {
  const line = (width: string) => (
    <span
      className="block h-1.5 rounded-full"
      style={{ width, backgroundColor: colors.text, opacity: 0.55 }}
    />
  )
  return (
    <span className="flex size-full" style={{ backgroundColor: colors.canvas }}>
      <span
        className="flex w-[34%] flex-col gap-1.5 px-2 pt-2.5"
        style={{
          backgroundColor: colors.sidebar,
          borderRight: `1px solid ${colors.line}`,
        }}
      >
        <span
          className="flex flex-col gap-1 rounded-md p-1"
          style={{ backgroundColor: colors.selected }}
        >
          {line('85%')}
          {line('55%')}
        </span>
        <span className="flex flex-col gap-1 p-1">
          {line('75%')}
          {line('45%')}
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-1.5 px-3 pt-3">
        {line('50%')}
        {line('90%')}
        {line('80%')}
        {line('65%')}
      </span>
    </span>
  )
}

function SchemeCard({
  scheme,
  selected,
  onSelect,
}: {
  scheme: Scheme
  selected: boolean
  onSelect: () => void
}) {
  const label =
    scheme === 'system' ? 'System' : scheme === 'light' ? 'Light' : 'Dark'
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border bg-card p-2 pb-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        selected
          ? 'border-focus-ring text-foreground ring-1 ring-focus-ring'
          : 'border-border/60 text-muted-foreground hover:border-input hover:text-foreground',
      )}
    >
      <span className="relative block aspect-[16/10] w-full overflow-hidden rounded-lg border border-border/60">
        {scheme === 'system' ? (
          <>
            <span className="absolute inset-0">
              <MiniWindow colors={LIGHT} />
            </span>
            <span className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
              <MiniWindow colors={DARK} />
            </span>
          </>
        ) : (
          <MiniWindow colors={scheme === 'light' ? LIGHT : DARK} />
        )}
      </span>
      <span className={cn(selected && 'font-medium')}>{label}</span>
    </button>
  )
}

export function AppearancePane() {
  const { theme, setTheme } = useTheme()
  // The stored choice is only known after hydration.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const current = mounted ? ((theme as Scheme | undefined) ?? 'system') : null

  return (
    <SettingsPageContainer
      title="Appearance"
      description="Otter Drive in light or dark, or following your system."
    >
      <SettingsSection title="Color scheme" variant="plain">
        <div className="grid grid-cols-3 gap-3">
          {(['system', 'light', 'dark'] as const).map((scheme) => (
            <SchemeCard
              key={scheme}
              scheme={scheme}
              selected={current === scheme}
              onSelect={() => setTheme(scheme)}
            />
          ))}
        </div>
      </SettingsSection>
    </SettingsPageContainer>
  )
}
