import { createFileRoute } from '@tanstack/react-router'
import { Overview } from '#/main/drive/overview'
import { useDrive } from '#/main/home-view'
import { TitleBand } from '#/main/top-bar'

export const Route = createFileRoute('/_app/home')({ component: HomeRoute })

function HomeRoute() {
  const { folder, documents, documentsLoading, noFolder } = useDrive()
  return (
    <>
      <TitleBand />
      <Overview
        folder={folder}
        documents={documents}
        loading={documentsLoading}
        noFolder={noFolder}
      />
    </>
  )
}
