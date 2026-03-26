import { createRouter } from '~/lib/create-app'
import { BUSINESS_HANDLER } from '~/routes/business/business.handler'
import { BUSINESS_ROUTES } from '~/routes/business/business.routes'

const router = createRouter()
;(Object.keys(BUSINESS_ROUTES) as Array<keyof typeof BUSINESS_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: HandlerMapFromRoutes ensures type safety
  router.openapi(BUSINESS_ROUTES[key], BUSINESS_HANDLER[key] as any)
})

export default router
