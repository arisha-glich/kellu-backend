import { createRouter } from '~/lib/create-app'
import { ADMIN_AUDIT_LOG_HANDLER } from '~/routes/admin/audit-logs/admin-audit-log.handler'
import { ADMIN_AUDIT_LOG_ROUTES } from '~/routes/admin/audit-logs/admin-audit-log.routes'

const router = createRouter()
;(Object.keys(ADMIN_AUDIT_LOG_ROUTES) as Array<keyof typeof ADMIN_AUDIT_LOG_ROUTES>).forEach(
  key => {
    // biome-ignore lint/suspicious/noExplicitAny: route map keys are aligned
    router.openapi(ADMIN_AUDIT_LOG_ROUTES[key], ADMIN_AUDIT_LOG_HANDLER[key] as any)
  }
)

export default router
