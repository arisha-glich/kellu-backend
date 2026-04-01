import { createRouter } from '~/lib/create-app'
import { ADMIN_ROLE_HANDLER } from '~/routes/admin/roles/admin-role.handler'
import { ADMIN_ROLE_ROUTES } from '~/routes/admin/roles/admin-role.routes'

const router = createRouter()
;(Object.keys(ADMIN_ROLE_ROUTES) as Array<keyof typeof ADMIN_ROLE_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: route map keys are aligned
  router.openapi(ADMIN_ROLE_ROUTES[key], ADMIN_ROLE_HANDLER[key] as any)
})

export default router
