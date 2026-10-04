import { createFileRoute } from '@tanstack/react-router'
import { Overview, SharedOverview } from '#/main/drive/overview'
import { useDrive } from '#/main/home-view'
import { TitleBand } from '#/main/top-bar'

export const Route = createFileRoute('/_app/home')({ component: HomeRoute })

function HomeRoute() {
  const {
    folder,
    documents,
    documentsLoading,
    noFolder,
    sharedView,
    sharedListed,
    sharedLoading,
  } = useDrive()
  return (
    <>
      <TitleBand />
      {sharedView ? (
        <SharedOverview items={sharedListed} loading={sharedLoading} />
      ) : (
        <Overview
          folder={folder}
          documents={documents}
          loading={documentsLoading}
          noFolder={noFolder}
        />
      )}
    </>
  )
}
