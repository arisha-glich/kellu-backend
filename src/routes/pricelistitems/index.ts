import { createRouter } from '~/lib/create-app'
import { PRICE_LIST_HANDLER } from '~/routes/pricelistitems/price-list.handler'
import { PRICE_LIST_ROUTES } from '~/routes/pricelistitems/price-list.routes'

const router = createRouter()
;(Object.keys(PRICE_LIST_ROUTES) as Array<keyof typeof PRICE_LIST_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: HandlerMapFromRoutes ensures type safety
  router.openapi(PRICE_LIST_ROUTES[key], PRICE_LIST_HANDLER[key] as any)
})

export default router
