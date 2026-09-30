import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { CommandPalette } from '@/components/command-palette'

import appCss from '../styles.css?url'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Otter Drive',
      },
      {
        name: 'description',
        content: 'Private documents for people and agents.',
      },
      {
        name: 'theme-color',
        content: '#ffffff',
        media: '(prefers-color-scheme: light)',
      },
      {
        name: 'theme-color',
        content: '#000000',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    links: [
      {
        rel: 'icon',
        href: '/favicon.svg',
        type: 'image/svg+xml',
      },
      {
        rel: 'icon',
        href: '/favicon.ico',
        sizes: 'any',
      },
      {
        rel: 'apple-touch-icon',
        href: '/logo192.png',
      },
      {
        rel: 'manifest',
        href: '/manifest.json',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { queryClient } = Route.useRouteContext()
  return (
    <QueryClientProvider client={queryClient}>
      <html lang="en" suppressHydrationWarning>
        <head>
          <HeadContent />
        </head>
        <body>
          <ThemeProvider>
            {children}
            <CommandPalette />
            <Toaster position="bottom-right" richColors closeButton />
          </ThemeProvider>
          <Scripts />
        </body>
      </html>
    </QueryClientProvider>
  )
}
