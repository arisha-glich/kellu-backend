import { createRouter } from '~/lib/create-app'
import { ADMIN_WORKORDER_HANDLER } from '~/routes/admin/workorders/admin-workorder.handler'
import { ADMIN_WORKORDER_ROUTES } from '~/routes/admin/workorders/admin-workorder.routes'

const router = createRouter()
;(Object.keys(ADMIN_WORKORDER_ROUTES) as Array<keyof typeof ADMIN_WORKORDER_ROUTES>).forEach(
  key => {
    // biome-ignore lint/suspicious/noExplicitAny: route map keys are aligned
    router.openapi(ADMIN_WORKORDER_ROUTES[key], ADMIN_WORKORDER_HANDLER[key] as any)
  }
)

export default router
