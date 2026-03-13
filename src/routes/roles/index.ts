import { createRouter } from '~/lib/create-app'
import { ROLE_HANDLER } from '~/routes/roles/role.handler'
import { ROLE_ROUTES } from '~/routes/roles/role.routes'

const router = createRouter()
;(Object.keys(ROLE_ROUTES) as Array<keyof typeof ROLE_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: HandlerMapFromRoutes ensures type safety
  router.openapi(ROLE_ROUTES[key], ROLE_HANDLER[key] as any)
})

export default router
