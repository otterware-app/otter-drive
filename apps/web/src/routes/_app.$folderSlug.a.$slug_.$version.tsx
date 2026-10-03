import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { DocumentRoute } from '#/main/drive/document-route'

export const Route = createFileRoute('/_app/$folderSlug/a/$slug_/$version')({
  validateSearch: z.object({
    sheet: z.string().trim().min(1).max(100).optional().catch(undefined),
  }),
  component: VersionRoute,
})

function VersionRoute() {
  const { folderSlug, slug, version } = Route.useParams()
  const { sheet } = Route.useSearch()
  const number = Number(version.replace(/^v/, ''))
  return (
    <DocumentRoute
      folderSlug={folderSlug}
      slug={slug}
      sheet={sheet}
      version={Number.isInteger(number) ? number : undefined}
    />
  )
}
