import { createRouter } from '~/lib/create-app'
import { QUOTE_HANDLER } from '~/routes/quotes/quotes.handler'
import { QUOTE_ROUTES } from '~/routes/quotes/quotes.routes'

const router = createRouter()

;(Object.keys(QUOTE_ROUTES) as Array<keyof typeof QUOTE_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: HandlerMapFromRoutes ensures type safety
  router.openapi(QUOTE_ROUTES[key], QUOTE_HANDLER[key] as any)
})

export default router
