import { createFileRoute } from '@tanstack/react-router'
import { Overview } from '#/main/drive/overview'
import { useDrive } from '#/main/home-view'
import { TitleBand } from '#/main/top-bar'

export const Route = createFileRoute('/_app/home')({ component: HomeRoute })

function HomeRoute() {
  const { team, documents, documentsLoading, noTeam } = useDrive()
  return (
    <>
      <TitleBand />
      <Overview
        team={team}
        documents={documents}
        loading={documentsLoading}
        noTeam={noTeam}
      />
    </>
  )
}
