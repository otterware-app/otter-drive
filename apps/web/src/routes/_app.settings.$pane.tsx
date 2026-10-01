import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '#/main/settings/settings-page'
import { TitleBand } from '#/main/top-bar'

export const Route = createFileRoute('/_app/settings/$pane')({
  component: SettingsRoute,
})

function SettingsRoute() {
  const { pane } = Route.useParams()
  return (
    <>
      <TitleBand />
      <SettingsPage pane={pane} />
    </>
  )
}
