import { createRouter } from '~/lib/create-app'
import { ME_HANDLER } from '~/routes/me/me.handler'
import { ME_ROUTES } from '~/routes/me/me.routes'

const router = createRouter()
;(Object.keys(ME_ROUTES) as Array<keyof typeof ME_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: HandlerMapFromRoutes ensures type safety
  router.openapi(ME_ROUTES[key], ME_HANDLER[key] as any)
})

export default router
