import * as HttpStatusCodes from 'stoker/http-status-codes'
import { hasAdminPortalAccess } from '~/lib/portal-access'
import type { ADMIN_AUDIT_LOG_ROUTES } from '~/routes/admin/audit-logs/admin-audit-log.routes'
import { listAuditLogFilterOptions, listAuditLogs } from '~/services/audit-log.service'
import type { HandlerMapFromRoutes } from '~/types'

const FORBIDDEN_ADMIN_PORTAL_ONLY =
  'This endpoint is only for admin portal accounts. Business users must use business-scoped APIs.'

export const ADMIN_AUDIT_LOG_HANDLER: HandlerMapFromRoutes<typeof ADMIN_AUDIT_LOG_ROUTES> = {
  filters: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    const hasAuditRead = !!user.permissions?.some(
      p => p.resource === 'auditLogs' && p.action === 'read'
    )
    if (!hasAuditRead && !user.isAdmin) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
    }
    const data = await listAuditLogFilterOptions()
    return c.json(
      { message: 'Audit log filter options retrieved successfully', success: true, data },
      HttpStatusCodes.OK
    )
  },
  list: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    const hasAuditRead = !!user.permissions?.some(
      p => p.resource === 'auditLogs' && p.action === 'read'
    )
    if (!hasAuditRead && !user.isAdmin) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
    }
    const query = c.req.valid('query')
    const page = query.page ? Number.parseInt(query.page, 10) : 1
    const limit = query.limit ? Number.parseInt(query.limit, 10) : 20
    const action = query.action === 'ALL' ? undefined : query.action
    const module = query.module === 'all' ? undefined : query.module
    const data = await listAuditLogs({
      action,
      module,
      businessId: query.businessId,
      search: query.search,
      page,
      limit,
    })
    return c.json(
      { message: 'Audit logs retrieved successfully', success: true, data },
      HttpStatusCodes.OK
    )
  },
}
