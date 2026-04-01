import { createRouter } from '~/lib/create-app'
import { ADMIN_TEAM_MEMBER_HANDLER } from '~/routes/admin/team-members/admin-team-member.handler'
import { ADMIN_TEAM_MEMBER_ROUTES } from '~/routes/admin/team-members/admin-team-member.routes'

const router = createRouter()
;(Object.keys(ADMIN_TEAM_MEMBER_ROUTES) as Array<keyof typeof ADMIN_TEAM_MEMBER_ROUTES>).forEach(
  key => {
    // biome-ignore lint/suspicious/noExplicitAny: route map keys are aligned
    router.openapi(ADMIN_TEAM_MEMBER_ROUTES[key], ADMIN_TEAM_MEMBER_HANDLER[key] as any)
  }
)

export default router
