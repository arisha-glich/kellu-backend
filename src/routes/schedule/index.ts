import { createRouter } from '~/lib/create-app'
import { SCHEDULE_HANDLER } from '~/routes/schedule/schedule.handler'
import { SCHEDULE_ROUTES } from '~/routes/schedule/schedule.routes'

const router = createRouter()
;(Object.keys(SCHEDULE_ROUTES) as Array<keyof typeof SCHEDULE_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: HandlerMapFromRoutes ensures type safety
  router.openapi(SCHEDULE_ROUTES[key], SCHEDULE_HANDLER[key] as any)
})

export default router
