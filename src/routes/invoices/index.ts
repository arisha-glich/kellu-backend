import { createRouter } from '~/lib/create-app'
import { INVOICE_HANDLER } from '~/routes/invoices/invoice.handler'
import { INVOICE_ROUTES } from '~/routes/invoices/invoice.routes'

const router = createRouter()
;(Object.keys(INVOICE_ROUTES) as Array<keyof typeof INVOICE_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: HandlerMapFromRoutes ensures type safety
  router.openapi(INVOICE_ROUTES[key], INVOICE_HANDLER[key] as any)
})

export default router
