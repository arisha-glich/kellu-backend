import { createRouter } from '~/lib/create-app'
import { EXPENSE_HANDLER } from '~/routes/expenses/expense.handler'
import { EXPENSE_ROUTES } from '~/routes/expenses/expense.routes'

const router = createRouter()
;(Object.keys(EXPENSE_ROUTES) as Array<keyof typeof EXPENSE_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: HandlerMapFromRoutes ensures type safety
  router.openapi(EXPENSE_ROUTES[key], EXPENSE_HANDLER[key] as any)
})

export default router
