import { createRouter } from '~/lib/create-app'
import { TEAM_HANDLER } from '~/routes/team/team.handler'
import { TEAM_ROUTES } from '~/routes/team/team.routes'

const router = createRouter()
;(Object.keys(TEAM_ROUTES) as Array<keyof typeof TEAM_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: HandlerMapFromRoutes ensures type safety
  router.openapi(TEAM_ROUTES[key], TEAM_HANDLER[key] as any)
})

export default router
