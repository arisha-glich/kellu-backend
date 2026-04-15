import { createRouter } from '~/lib/create-app'
import { ADMIN_EXPENSE_HANDLER } from '~/routes/admin/expenses/admin-expense.handler'
import { ADMIN_EXPENSE_ROUTES } from '~/routes/admin/expenses/admin-expense.routes'

const router = createRouter()
;(Object.keys(ADMIN_EXPENSE_ROUTES) as Array<keyof typeof ADMIN_EXPENSE_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: route map keys are aligned
  router.openapi(ADMIN_EXPENSE_ROUTES[key], ADMIN_EXPENSE_HANDLER[key] as any)
})

export default router
