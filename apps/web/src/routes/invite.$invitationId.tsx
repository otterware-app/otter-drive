import { createFileRoute, redirect } from '@tanstack/react-router'
export const Route = createFileRoute('/invite/$invitationId')({
  beforeLoad: () => {
    throw redirect({ to: '/home' })
  },
})
