import * as HttpStatusCodes from 'stoker/http-status-codes'
import { hasAdminPortalAccess } from '~/lib/portal-access'
import type { ADMIN_REPORT_ROUTES } from '~/routes/admin/reports/admin-report.routes'
import {
  getAdminBusinessesReport,
  getAdminExpensesReport,
  getAdminJobsReport,
  getAdminReportsSummary,
  getAdminRevenueReport,
  getAdminUserActivityReport,
  resolveAdminReportRange,
} from '~/services/admin-report.service'
import type { HandlerMapFromRoutes } from '~/types'

const FORBIDDEN_ADMIN_PORTAL_ONLY =
  'This endpoint is only for admin portal accounts. Business users must use business-scoped APIs.'

function hasReportsReadPermission(user: { permissions?: Array<{ resource: string; action: string }>; isAdmin?: boolean }) {
  const hasRead = !!user.permissions?.some(p => p.resource === 'reports' && p.action === 'read')
  return hasRead || !!user.isAdmin
}

export const ADMIN_REPORT_HANDLER: HandlerMapFromRoutes<typeof ADMIN_REPORT_ROUTES> = {
  summary: async c => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    if (!hasReportsReadPermission(user)) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const query = c.req.valid('query')
      const range = resolveAdminReportRange(query.preset, query.from, query.to)
      const data = await getAdminReportsSummary({ range, businessId: query.businessId })
      return c.json({ message: 'Reports summary retrieved successfully', success: true, data }, HttpStatusCodes.OK)
    } catch (error) {
      if (error instanceof Error && error.message.includes('DATE')) {
        return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      }
      return c.json({ message: 'Failed to retrieve reports summary' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  businesses: async c => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    if (!hasReportsReadPermission(user)) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const query = c.req.valid('query')
      const range = resolveAdminReportRange(query.preset, query.from, query.to)
      const data = await getAdminBusinessesReport({ range, businessId: query.businessId })
      return c.json({ message: 'Businesses report retrieved successfully', success: true, data }, HttpStatusCodes.OK)
    } catch (error) {
      if (error instanceof Error && error.message.includes('DATE')) {
        return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      }
      return c.json({ message: 'Failed to retrieve businesses report' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  jobs: async c => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    if (!hasReportsReadPermission(user)) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const query = c.req.valid('query')
      const range = resolveAdminReportRange(query.preset, query.from, query.to)
      const data = await getAdminJobsReport({ range, businessId: query.businessId })
      return c.json({ message: 'Jobs report retrieved successfully', success: true, data }, HttpStatusCodes.OK)
    } catch (error) {
      if (error instanceof Error && error.message.includes('DATE')) {
        return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      }
      return c.json({ message: 'Failed to retrieve jobs report' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  revenue: async c => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    if (!hasReportsReadPermission(user)) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const query = c.req.valid('query')
      const range = resolveAdminReportRange(query.preset, query.from, query.to)
      const data = await getAdminRevenueReport({ range, businessId: query.businessId })
      return c.json({ message: 'Revenue report retrieved successfully', success: true, data }, HttpStatusCodes.OK)
    } catch (error) {
      if (error instanceof Error && error.message.includes('DATE')) {
        return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      }
      return c.json({ message: 'Failed to retrieve revenue report' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  expenses: async c => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    if (!hasReportsReadPermission(user)) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const query = c.req.valid('query')
      const range = resolveAdminReportRange(query.preset, query.from, query.to)
      const data = await getAdminExpensesReport({ range, businessId: query.businessId })
      return c.json({ message: 'Expenses report retrieved successfully', success: true, data }, HttpStatusCodes.OK)
    } catch (error) {
      if (error instanceof Error && error.message.includes('DATE')) {
        return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      }
      return c.json({ message: 'Failed to retrieve expenses report' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  userActivity: async c => {
    const user = c.get('user')
    if (!user) return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    if (!(await hasAdminPortalAccess(user.id))) {
      return c.json({ message: FORBIDDEN_ADMIN_PORTAL_ONLY }, HttpStatusCodes.FORBIDDEN)
    }
    if (!hasReportsReadPermission(user)) {
      return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
    }
    try {
      const query = c.req.valid('query')
      const range = resolveAdminReportRange(query.preset, query.from, query.to)
      const data = await getAdminUserActivityReport({ range, businessId: query.businessId })
      return c.json({ message: 'User activity report retrieved successfully', success: true, data }, HttpStatusCodes.OK)
    } catch (error) {
      if (error instanceof Error && error.message.includes('DATE')) {
        return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      }
      return c.json({ message: 'Failed to retrieve user activity report' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },
}
