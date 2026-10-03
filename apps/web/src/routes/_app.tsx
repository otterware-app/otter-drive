import {
  Outlet,
  createFileRoute,
  useLocation,
  useNavigate,
  useParams,
} from '@tanstack/react-router'
import { AuthGate } from '#/main/auth/auth-gate'
import { driveSearchSchema, type DriveSearch } from '#/main/drive/documents'
import { DriveHome, type Place } from '#/main/home-view'
import { ShellSkeleton } from '#/main/shell-skeleton'

/**
 * Every signed-in page shares one window (main/home-view.tsx): the rail, the
 * sidebar and the list stay put while the main pane follows the route. The
 * list's view, kind, search and sort live in the URL here, so they survive
 * opening documents and going back.
 */
export const Route = createFileRoute('/_app')({
  validateSearch: driveSearchSchema,
  component: AppLayout,
})

function AppLayout() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const params = useParams({ strict: false })
  const pathname = useLocation({ select: (location) => location.pathname })

  const place: Place =
    params.folderSlug && params.slug
      ? {
          kind: 'document',
          folderSlug: params.folderSlug,
          slug: params.slug,
        }
      : pathname.startsWith('/settings')
        ? { kind: 'settings', pane: params.pane ?? 'folder' }
        : { kind: 'home' }

  function onSearchChange(update: Partial<DriveSearch>, replace = false) {
    void navigate({
      to: '.',
      search: (current) => ({ ...current, ...update }),
      replace,
    })
  }

  return (
    <AuthGate fallback={<ShellSkeleton />}>
      <DriveHome place={place} search={search} onSearchChange={onSearchChange}>
        <Outlet />
      </DriveHome>
    </AuthGate>
  )
}
