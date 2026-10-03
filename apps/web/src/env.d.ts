import '@tanstack/react-start'

declare global {
  interface OtterDriveEnv {
    APP_URL: string
    CONTENT_URL: string
    ADMIN_EMAIL: string
    BETTER_AUTH_SECRET: string
    CONTENT_SIGNING_KEY: string
    OTTER_AUTH_URL: string
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
    RESEND_API_KEY?: string
    EMAIL_FROM?: string
    DB: D1Database
    ARTIFACTS: R2Bucket
    ASSETS: Fetcher
    BROWSER: BrowserRun
  }

  interface Env extends OtterDriveEnv {}

  namespace Cloudflare {
    interface Env extends OtterDriveEnv {}
  }
}
