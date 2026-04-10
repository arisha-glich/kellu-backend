import * as HttpStatusCodes from 'stoker/http-status-codes'
import { hasAdminPortalAccess } from '~/lib/portal-access'
import type { ADMIN_REPORT_ROUTES } from '~/routes/admin/reports/admin-report.routes'
import {
  getAdminBusinessesReport,
  getAdminInvoicesReport,
  getAdminReportsSummary,
  getAdminRevenueReport,
  getAdminWorkordersReport,
  resolveAdminReportRange,
} from '~/services/admin-report.service'
import { createAuditLog } from '~/services/audit-log.service'
import type { HandlerMapFromRoutes } from '~/types'

const FORBIDDEN_ADMIN_PORTAL_ONLY =
  'This endpoint is only for admin portal accounts. Business users must use business-scoped APIs.'

function getClientMeta(c: { req: { header: (k: string) => string | undefined } }) {
  const forwarded = c.req.header('x-forwarded-for')
  const ipAddress = forwarded?.split(',')[0]?.trim() || null
  const userAgent = c.req.header('user-agent') ?? null
  return { ipAddress, userAgent }
}

function hasReportsReadPermission(user: {
  permissions?: Array<{ resource: string; action: string }>
  isAdmin?: boolean
}) {
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
      const normalizedReportType =
        query.reportType === 'JOBS_REPORT' ? 'WORKORDERS_REPORT' : query.reportType
      const filters = { range, businessId: query.businessId, reportType: normalizedReportType }
      const fullData = await getAdminReportsSummary(filters)
      const data =
        normalizedReportType === 'BUSINESS_SUMMARY'
          ? { businesses: fullData.businesses }
          : normalizedReportType === 'WORKORDERS_REPORT'
            ? { workorders: fullData.workorders }
            : normalizedReportType === 'REVENUE_REPORT'
              ? { revenue: fullData.revenue }
              : normalizedReportType === 'INVOICES_REPORT'
                ? { invoices: fullData.invoices }
                : fullData
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'REPORT_READ',
        module: 'reports',
        newValues: { reportType: normalizedReportType ?? 'ALL' },
        userId: user.id,
        businessId: query.businessId ?? null,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Reports summary retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof Error && error.message.includes('DATE')) {
        return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      }
      return c.json(
        { message: 'Failed to retrieve reports summary' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
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
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'REPORT_READ',
        module: 'reports',
        newValues: { reportType: 'BUSINESS_SUMMARY' },
        userId: user.id,
        businessId: query.businessId ?? null,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Businesses report retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof Error && error.message.includes('DATE')) {
        return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      }
      return c.json(
        { message: 'Failed to retrieve businesses report' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  workorders: async c => {
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
      const data = await getAdminWorkordersReport({ range, businessId: query.businessId })
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'REPORT_READ',
        module: 'reports',
        newValues: { reportType: 'WORKORDERS_REPORT' },
        userId: user.id,
        businessId: query.businessId ?? null,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Workorders report retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof Error && error.message.includes('DATE')) {
        return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      }
      return c.json(
        { message: 'Failed to retrieve workorders report' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  invoices: async c => {
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
      const data = await getAdminInvoicesReport({ range, businessId: query.businessId })
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'REPORT_READ',
        module: 'reports',
        newValues: { reportType: 'INVOICES_REPORT' },
        userId: user.id,
        businessId: query.businessId ?? null,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Invoices report retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof Error && error.message.includes('DATE')) {
        return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      }
      return c.json(
        { message: 'Failed to retrieve invoices report' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
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
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'REPORT_READ',
        module: 'reports',
        newValues: { reportType: 'REVENUE_REPORT' },
        userId: user.id,
        businessId: query.businessId ?? null,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Revenue report retrieved successfully', success: true, data },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof Error && error.message.includes('DATE')) {
        return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
      }
      return c.json(
        { message: 'Failed to retrieve revenue report' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
