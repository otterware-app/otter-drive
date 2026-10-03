import { apiKeyClient } from '@better-auth/api-key/client'
import { createAuthClient } from 'better-auth/react'
import { deviceAuthorizationClient } from 'better-auth/client/plugins'
export const authClient = createAuthClient({
  plugins: [deviceAuthorizationClient(), apiKeyClient()],
})
