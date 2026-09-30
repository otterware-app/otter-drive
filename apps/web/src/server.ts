import { env } from 'cloudflare:workers'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import {
  hostNotFound,
  isAllowedHostPath,
  isApplicationAsset,
  migrateLegacyRequest,
} from './server/host-policy'

export default createServerEntry({
  fetch(request) {
    const migrated = migrateLegacyRequest(request, env)
    if (migrated instanceof Response) return migrated
    request = migrated
    if (!isAllowedHostPath(request, env)) return hostNotFound()
    if (isApplicationAsset(request, env)) return env.ASSETS.fetch(request)
    if (import.meta.env.DEV) {
      // Vite serves dev modules and styles from /src/*, /@* and
      // /node_modules/* instead of the built /assets/* paths that
      // isApplicationAsset expects.
      const { pathname } = new URL(request.url)
      if (
        pathname.startsWith('/src/') ||
        pathname.startsWith('/@') ||
        pathname.startsWith('/node_modules/')
      )
        return env.ASSETS.fetch(request)
    }
    return handler.fetch(request)
  },
})
