import { createRouter } from '~/lib/create-app'
import { ADMIN_REPORT_HANDLER } from '~/routes/admin/reports/admin-report.handler'
import { ADMIN_REPORT_ROUTES } from '~/routes/admin/reports/admin-report.routes'

const router = createRouter()
;(Object.keys(ADMIN_REPORT_ROUTES) as Array<keyof typeof ADMIN_REPORT_ROUTES>).forEach(key => {
  // biome-ignore lint/suspicious/noExplicitAny: route map keys are aligned
  router.openapi(ADMIN_REPORT_ROUTES[key], ADMIN_REPORT_HANDLER[key] as any)
})

export default router
