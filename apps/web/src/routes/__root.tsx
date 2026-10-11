import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { ErrorBoundaryView } from '@/components/ui/error-boundary-view'
import { ToastProvider } from '@/components/ui/toast'
import { ThemeProvider } from '#/main/theme-provider'

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
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
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
        content: '#f9f9f9',
        media: '(prefers-color-scheme: light)',
      },
      {
        name: 'theme-color',
        content: '#202020',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    links: [
      // Local runs wear the blueprint icon, so they're told apart from the
      // live app's tabs.
      {
        rel: 'icon',
        href: import.meta.env.DEV ? '/favicon-dev.ico' : '/favicon.ico',
        // Not "any": Chrome would take the .ico over the adaptive SVG.
        sizes: '32x32',
      },
      {
        rel: 'icon',
        href: import.meta.env.DEV ? '/favicon-dev.svg' : '/favicon.svg',
        type: 'image/svg+xml',
      },
      {
        rel: 'apple-touch-icon',
        href: '/apple-touch-icon.png',
        sizes: '180x180',
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
  errorComponent: ErrorBoundaryView,
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
            <ToastProvider>{children}</ToastProvider>
          </ThemeProvider>
          <Scripts />
        </body>
      </html>
    </QueryClientProvider>
  )
}
