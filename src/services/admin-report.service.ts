import { Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'

export type AdminReportPreset =
  | 'LAST_7_DAYS'
  | 'LAST_30_DAYS'
  | 'LAST_3_MONTHS'
  | 'LAST_12_MONTHS'
  | 'THIS_YEAR'
  | 'ALL_TIME'

export type AdminReportType =
  | 'BUSINESS_SUMMARY'
  | 'REVENUE_REPORT'
  | 'WORKORDERS_REPORT'
  | 'INVOICES_REPORT'

export interface AdminReportRange {
  from: Date
  to: Date
}

export interface AdminReportFilters {
  range: AdminReportRange
  businessId?: string
  reportType?: AdminReportType
}

export interface AdminPortalDashboardOverview {
  totalBusinesses: number
  totalRevenue: number
  totalWorkordersCreated: number
  totalUsers: number
  invoicesGenerated: number
  activeBusinesses: number
  inactiveBusinesses: number
  suspendedAccounts: number
  systemHealth: {
    serverUptimePercent: number
    activeSessions: number
    suspendedAccounts: number
    failedLogins24h: number
  }
}

function parseDayStartUtc(isoDate: string): Date {
  const d = isoDate.includes('T') ? new Date(isoDate) : new Date(`${isoDate}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) {
    throw new Error('INVALID_FROM_DATE')
  }
  return d
}

function parseDayEndUtc(isoDate: string): Date {
  const d = isoDate.includes('T') ? new Date(isoDate) : new Date(`${isoDate}T23:59:59.999Z`)
  if (Number.isNaN(d.getTime())) {
    throw new Error('INVALID_TO_DATE')
  }
  return d
}

export function resolveAdminReportRange(
  preset: AdminReportPreset | undefined,
  fromStr: string | undefined,
  toStr: string | undefined
): AdminReportRange {
  if (fromStr && toStr) {
    return { from: parseDayStartUtc(fromStr), to: parseDayEndUtc(toStr) }
  }

  const p = preset ?? 'LAST_30_DAYS'
  const now = new Date()
  const end = new Date(now)
  end.setUTCHours(23, 59, 59, 999)

  if (p === 'ALL_TIME') {
    return { from: new Date(0), to: end }
  }
  if (p === 'LAST_7_DAYS') {
    const from = new Date(now.getTime() - 7 * 86_400_000)
    from.setUTCHours(0, 0, 0, 0)
    return { from, to: end }
  }

  if (p === 'LAST_30_DAYS') {
    const from = new Date(now.getTime() - 30 * 86_400_000)
    from.setUTCHours(0, 0, 0, 0)
    return { from, to: end }
  }
  if (p === 'LAST_3_MONTHS') {
    const from = new Date(now.getTime() - 90 * 86_400_000)
    from.setUTCHours(0, 0, 0, 0)
    return { from, to: end }
  }
  if (p === 'LAST_12_MONTHS') {
    const from = new Date(now.getTime() - 365 * 86_400_000)
    from.setUTCHours(0, 0, 0, 0)
    return { from, to: end }
  }

  const from = new Date(now.getTime() - 30 * 86_400_000)
  from.setUTCHours(0, 0, 0, 0)
  return { from, to: end }
}

function businessRowWhere(
  base: Prisma.BusinessWhereInput,
  businessId?: string
): Prisma.BusinessWhereInput {
  if (!businessId) {
    return base
  }
  return { ...base, id: businessId }
}

function workOrderScopeWhere(
  base: Prisma.WorkOrderWhereInput,
  businessId?: string
): Prisma.WorkOrderWhereInput {
  if (!businessId) {
    return base
  }
  return { ...base, businessId }
}

export async function getAdminBusinessesReport(filters: AdminReportFilters) {
  const { from, to } = filters.range
  const baseWhere = businessRowWhere({}, filters.businessId)

  const [totals, rows] = await Promise.all([
    prisma.business.aggregate({
      where: baseWhere,
      _count: { _all: true },
    }),
    prisma.$queryRaw<
      Array<{
        businessId: string
        businessName: string
        totalWorkorders: number
        revenue: number
        invoicePaid: number
        invoiceOverdue: number
      }>
    >(
      Prisma.sql`
      SELECT b.id AS "businessId",
             b.name AS "businessName",
             COALESCE(w.workorders, 0)::int AS "totalWorkorders",
             COALESCE(r.revenue, 0)::float AS "revenue",
             COALESCE(i."invoicePaid", 0)::int AS "invoicePaid",
             COALESCE(i."invoiceOverdue", 0)::int AS "invoiceOverdue"
      FROM "Business" b
      LEFT JOIN (
        SELECT wo."businessId", COUNT(*)::int AS workorders
        FROM "WorkOrder" wo
        WHERE wo."createdAt" >= ${from}
          AND wo."createdAt" <= ${to}
          ${filters.businessId ? Prisma.sql`AND wo."businessId" = ${filters.businessId}` : Prisma.sql``}
        GROUP BY wo."businessId"
      ) w ON w."businessId" = b.id
      LEFT JOIN (
        SELECT i."businessId", COALESCE(SUM(i.total), 0)::float AS revenue
        FROM "Invoice" i
        WHERE i.status <> 'CANCELLED'::"InvoiceStatus"
          AND COALESCE(i."sentAt", i."createdAt") >= ${from}
          AND COALESCE(i."sentAt", i."createdAt") <= ${to}
          ${filters.businessId ? Prisma.sql`AND i."businessId" = ${filters.businessId}` : Prisma.sql``}
        GROUP BY i."businessId"
      ) r ON r."businessId" = b.id
      LEFT JOIN (
        SELECT i."businessId",
               COUNT(*) FILTER (WHERE i.status = 'PAID'::"InvoiceStatus")::int AS "invoicePaid",
               COUNT(*) FILTER (WHERE i.status = 'OVERDUE'::"InvoiceStatus")::int AS "invoiceOverdue"
        FROM "Invoice" i
        WHERE i.status <> 'CANCELLED'::"InvoiceStatus"
          AND COALESCE(i."sentAt", i."createdAt") >= ${from}
          AND COALESCE(i."sentAt", i."createdAt") <= ${to}
          ${filters.businessId ? Prisma.sql`AND i."businessId" = ${filters.businessId}` : Prisma.sql``}
        GROUP BY i."businessId"
      ) i ON i."businessId" = b.id
      WHERE 1=1
      ${filters.businessId ? Prisma.sql`AND b.id = ${filters.businessId}` : Prisma.sql``}
      ORDER BY "revenue" DESC, "totalWorkorders" DESC, b.name ASC
      `
    ),
  ])

  const [activeBusinesses, newBusinesses] = await Promise.all([
    prisma.business.count({
      where: businessRowWhere({ isActive: true }, filters.businessId),
    }),
    prisma.business.count({
      where: businessRowWhere({ createdAt: { gte: from, lte: to } }, filters.businessId),
    }),
  ])

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      totalBusinesses: totals._count._all,
      activeBusinesses,
      inactiveBusinesses: totals._count._all - activeBusinesses,
      newBusinesses,
    },
    byBusiness: rows,
  }
}

export async function getAdminWorkordersReport(filters: AdminReportFilters) {
  const { from, to } = filters.range
  const grouped = await prisma.workOrder.groupBy({
    by: ['jobStatus'],
    where: workOrderScopeWhere({ createdAt: { gte: from, lte: to } }, filters.businessId),
    _count: { _all: true },
  })
  const byStatus: Record<string, number> = {}
  let totalWorkorders = 0
  for (const row of grouped) {
    byStatus[row.jobStatus] = row._count._all
    totalWorkorders += row._count._all
  }
  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    totalWorkorders,
    byStatus,
  }
}

export async function getAdminInvoicesReport(filters: AdminReportFilters) {
  const { from, to } = filters.range
  const rows = await prisma.$queryRaw<
    Array<{
      invoicePaid: number
      invoiceOverdue: number
      invoiceCount: number
    }>
  >(
    Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE i.status = 'PAID'::"InvoiceStatus")::int AS "invoicePaid",
      COUNT(*) FILTER (WHERE i.status = 'OVERDUE'::"InvoiceStatus")::int AS "invoiceOverdue",
      COUNT(*)::int AS "invoiceCount"
    FROM "Invoice" i
    WHERE i.status <> 'CANCELLED'::"InvoiceStatus"
      AND COALESCE(i."sentAt", i."createdAt") >= ${from}
      AND COALESCE(i."sentAt", i."createdAt") <= ${to}
      ${filters.businessId ? Prisma.sql`AND i."businessId" = ${filters.businessId}` : Prisma.sql``}
    `
  )
  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    ...(rows[0] ?? {
      invoicePaid: 0,
      invoiceOverdue: 0,
      invoiceCount: 0,
    }),
  }
}

export async function getAdminRevenueReport(filters: AdminReportFilters) {
  const { from, to } = filters.range

  const rows = await prisma.$queryRaw<
    Array<{
      totalRevenue: number
      paidRevenue: number
      outstandingRevenue: number
      invoiceCount: number
    }>
  >(
    Prisma.sql`
    SELECT
      COALESCE(SUM(i.total), 0)::float AS "totalRevenue",
      COALESCE(SUM(i."amountPaid"), 0)::float AS "paidRevenue",
      COALESCE(SUM(i.balance), 0)::float AS "outstandingRevenue",
      COUNT(*)::int AS "invoiceCount"
    FROM "Invoice" i
    WHERE i.status <> 'CANCELLED'::"InvoiceStatus"
      AND COALESCE(i."sentAt", i."createdAt") >= ${from}
      AND COALESCE(i."sentAt", i."createdAt") <= ${to}
      ${filters.businessId ? Prisma.sql`AND i."businessId" = ${filters.businessId}` : Prisma.sql``}
    `
  )

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    ...(rows[0] ?? {
      totalRevenue: 0,
      paidRevenue: 0,
      outstandingRevenue: 0,
      invoiceCount: 0,
    }),
  }
}

export async function getAdminReportsSummary(filters: AdminReportFilters) {
  const [businesses, workorders, revenue, invoices] = await Promise.all([
    getAdminBusinessesReport(filters),
    getAdminWorkordersReport(filters),
    getAdminRevenueReport(filters),
    getAdminInvoicesReport(filters),
  ])
  return { businesses, workorders, revenue, invoices }
}

export async function getAdminPortalDashboardOverview(
  filters: AdminReportFilters
): Promise<AdminPortalDashboardOverview> {
  const { from, to } = filters.range
  const businessScope = filters.businessId ? { businessId: filters.businessId } : {}

  const [
    totalBusinesses,
    activeBusinesses,
    totalWorkordersCreated,
    totalUsers,
    invoicesGenerated,
    suspendedAccounts,
    activeSessions,
    revenueRows,
  ] = await Promise.all([
    prisma.business.count({ where: businessRowWhere({}, filters.businessId) }),
    prisma.business.count({ where: businessRowWhere({ isActive: true }, filters.businessId) }),
    prisma.workOrder.count({
      where: workOrderScopeWhere({ createdAt: { gte: from, lte: to } }, filters.businessId),
    }),
    prisma.user.count({
      where: filters.businessId
        ? {
            OR: [
              { businessesOwned: { some: { id: filters.businessId } } },
              { teamMemberships: { some: { businessId: filters.businessId } } },
            ],
          }
        : undefined,
    }),
    prisma.invoice.count({
      where: {
        ...businessScope,
        createdAt: { gte: from, lte: to },
      },
    }),
    prisma.user.count({
      where: filters.businessId
        ? {
            banned: true,
            OR: [
              { businessesOwned: { some: { id: filters.businessId } } },
              { teamMemberships: { some: { businessId: filters.businessId } } },
            ],
          }
        : { banned: true },
    }),
    prisma.session.count({
      where: {
        expiresAt: { gt: new Date() },
        user: filters.businessId
          ? {
              OR: [
                { businessesOwned: { some: { id: filters.businessId } } },
                { teamMemberships: { some: { businessId: filters.businessId } } },
              ],
            }
          : undefined,
      },
    }),
    prisma.$queryRaw<Array<{ totalRevenue: number }>>(
      Prisma.sql`
      SELECT COALESCE(SUM(i.total), 0)::float AS "totalRevenue"
      FROM "Invoice" i
      WHERE i.status <> 'CANCELLED'::"InvoiceStatus"
        AND COALESCE(i."sentAt", i."createdAt") >= ${from}
        AND COALESCE(i."sentAt", i."createdAt") <= ${to}
        ${filters.businessId ? Prisma.sql`AND i."businessId" = ${filters.businessId}` : Prisma.sql``}
      `
    ),
  ])

  const totalRevenue = revenueRows[0]?.totalRevenue ?? 0
  const inactiveBusinesses = totalBusinesses - activeBusinesses
  const failedLogins24h = 0

  return {
    totalBusinesses,
    totalRevenue,
    totalWorkordersCreated,
    totalUsers,
    invoicesGenerated,
    activeBusinesses,
    inactiveBusinesses,
    suspendedAccounts,
    systemHealth: {
      // Backend currently does not persist server uptime or failed auth events.
      // Returning stable placeholders lets frontend render while telemetry is added.
      serverUptimePercent: 99.9,
      activeSessions,
      suspendedAccounts,
      failedLogins24h,
    },
  }
}
