import { createRouter } from '~/lib/create-app'
import { INSIGHTS_HANDLER } from '~/routes/insights/insights.handler'
import { INSIGHTS_ROUTES } from '~/routes/insights/insights.routes'

const router = createRouter()
;(Object.keys(INSIGHTS_ROUTES) as Array<keyof typeof INSIGHTS_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: HandlerMapFromRoutes ensures type safety
  router.openapi(INSIGHTS_ROUTES[key], INSIGHTS_HANDLER[key] as any)
})

export default router
