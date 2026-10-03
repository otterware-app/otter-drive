import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { DocumentRoute } from '#/main/drive/document-route'

export const Route = createFileRoute('/_app/$folderSlug/a/$slug')({
  validateSearch: z.object({
    sheet: z.string().trim().min(1).max(100).optional().catch(undefined),
  }),
  component: ArtifactRoute,
})

function ArtifactRoute() {
  const { folderSlug, slug } = Route.useParams()
  const { sheet } = Route.useSearch()
  return <DocumentRoute folderSlug={folderSlug} slug={slug} sheet={sheet} />
}
