import { createRouter } from '~/lib/create-app'
import { ADMIN_NOTIFICATION_HANDLER } from '~/routes/admin/notifications/admin-notification.handler'
import { ADMIN_NOTIFICATION_ROUTES } from '~/routes/admin/notifications/admin-notification.routes'

const router = createRouter()
;(Object.keys(ADMIN_NOTIFICATION_ROUTES) as Array<keyof typeof ADMIN_NOTIFICATION_ROUTES>).forEach(
  key => {
    // biome-ignore lint/suspicious/noExplicitAny: route map keys are aligned
    router.openapi(ADMIN_NOTIFICATION_ROUTES[key], ADMIN_NOTIFICATION_HANDLER[key] as any)
  }
)

export default router
