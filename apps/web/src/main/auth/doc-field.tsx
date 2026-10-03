import type { CSSProperties } from 'react'

/**
 * The sign-in page's backdrop (Otter Mail's MailField): lines of
 * real-sounding documents drifting past, too soft to read. The middle stays
 * clear for the form in front of it, and the field fades out at the top and
 * bottom.
 */

const LINES = [
  'Q3 board update: revenue grew 18% quarter over quarter, driven by the enterprise plan and two new regions.',
  'Onboarding checklist for new engineers: laptop, accounts, the architecture tour, and a first small fix.',
  'Launch plan v4: the waitlist opens on Monday, press goes out Tuesday at 9:00, and the changelog ships with it.',
  'Pricing research: folders under ten seats prefer monthly billing; larger folders ask for annual invoices.',
  'Design review notes: tighten the empty states, use one icon weight, and keep the sidebar quiet.',
  'Hiring scorecard, senior backend engineer: strong on distributed systems, clear writer, asked good questions.',
  'Incident report: p95 latency in eu-west rose for 42 minutes after a cache node restarted without its warmup.',
  'Research summary: agents publish most documents between 2 and 5 in the afternoon, usually as new versions.',
  'Travel budget 2026.xlsx: offsites in Lisbon and Kyoto, flights booked early, one shared calendar.',
  'Release notes: faster uploads, a new version picker, and spreadsheets that open where you left them.',
  'Contract renewal: 40 more seats, annual billing, and SSO turned on before the end of the quarter.',
  'Weekly metrics: 1,204 documents, 3,981 versions, and every one of them still there to go back to.',
]

/** Seconds per loop, row by row: slow enough to feel still. */
const PACE = [1800, 2200, 1600, 2000, 2400, 1700, 2100, 1500, 2300, 1900]

// Each row repeats one period twice, so sliding it by half loops seamlessly.
const ROWS = Array.from({ length: 80 }, (_, row) => {
  let period = ''
  for (let index = 0; index < 8; index++)
    period += LINES[(row * 5 + index * 7) % LINES.length] + '          '
  return period + period
})

const MASK = [
  'linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%)',
  'radial-gradient(ellipse 50% 56% at 50% 50%, transparent 0%, transparent 58%, #000 100%)',
].join(', ')

const MASK_STYLE: CSSProperties = {
  maskImage: MASK,
  WebkitMaskImage: MASK,
  maskComposite: 'intersect',
  WebkitMaskComposite: 'source-in',
}

export function DocField() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden sm:block"
      style={MASK_STYLE}
    >
      <div className="text-[13px] leading-[1.65rem] whitespace-pre text-foreground opacity-[0.055] dark:opacity-[0.06]">
        {ROWS.map((text, index) => (
          <div
            key={index}
            className="w-max motion-safe:animate-[doc-field-slide_1s_linear_infinite]"
            style={{
              animationDuration: `${PACE[index % PACE.length]}s`,
              animationDirection: index % 2 ? 'reverse' : undefined,
            }}
          >
            {text}
          </div>
        ))}
      </div>
    </div>
  )
}
