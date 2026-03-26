import { createRouter } from '~/lib/create-app'
import { NOTIFICATION_HANDLER } from '~/routes/notifications/notifications.handler'
import { NOTIFICATION_ROUTES } from '~/routes/notifications/notifications.routes'

const router = createRouter()
;(Object.keys(NOTIFICATION_ROUTES) as Array<keyof typeof NOTIFICATION_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: HandlerMapFromRoutes ensures type safety
  router.openapi(NOTIFICATION_ROUTES[key], NOTIFICATION_HANDLER[key] as any)
})

export default router
