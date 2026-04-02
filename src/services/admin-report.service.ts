import { Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'

export type AdminReportPreset =
  | 'LAST_7_DAYS'
  | 'LAST_30_DAYS'
  | 'THIS_MONTH'
  | 'THIS_YEAR'
  | 'CUSTOM'

export interface AdminReportRange {
  from: Date
  to: Date
}

export interface AdminReportFilters {
  range: AdminReportRange
  businessId?: string
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

  if (p === 'CUSTOM') {
    throw new Error('CUSTOM_PRESET_REQUIRES_FROM_TO')
  }
  if (p === 'LAST_7_DAYS') {
    const from = new Date(now.getTime() - 7 * 86_400_000)
    from.setUTCHours(0, 0, 0, 0)
    return { from, to: end }
  }
  if (p === 'THIS_MONTH') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
    return { from, to: end }
  }
  if (p === 'THIS_YEAR') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0))
    return { from, to: end }
  }

  const from = new Date(now.getTime() - 30 * 86_400_000)
  from.setUTCHours(0, 0, 0, 0)
  return { from, to: end }
}

function businessScopeWhere<T extends { businessId?: string }>(base: T, businessId?: string): T {
  if (!businessId) return base
  return { ...base, businessId } as T
}

export async function getAdminBusinessesReport(filters: AdminReportFilters) {
  const { from, to } = filters.range
  const baseWhere = businessScopeWhere({}, filters.businessId)

  const [totals, rows] = await Promise.all([
    prisma.business.aggregate({
      where: baseWhere,
      _count: { _all: true },
    }),
    prisma.$queryRaw<
      Array<{
        businessId: string
        businessName: string
        totalJobs: number
        revenue: number
        expenses: number
      }>
    >(
      Prisma.sql`
      SELECT b.id AS "businessId",
             b.name AS "businessName",
             COALESCE(j.jobs, 0)::int AS "totalJobs",
             COALESCE(r.revenue, 0)::float AS "revenue",
             COALESCE(e.expenses, 0)::float AS "expenses"
      FROM "Business" b
      LEFT JOIN (
        SELECT w."businessId", COUNT(*)::int AS jobs
        FROM "WorkOrder" w
        WHERE w."createdAt" >= ${from}
          AND w."createdAt" <= ${to}
          ${filters.businessId ? Prisma.sql`AND w."businessId" = ${filters.businessId}` : Prisma.sql``}
        GROUP BY w."businessId"
      ) j ON j."businessId" = b.id
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
        SELECT ex."businessId", COALESCE(SUM(ex.total), 0)::float AS expenses
        FROM "Expense" ex
        WHERE ex."date" >= ${from}
          AND ex."date" <= ${to}
          ${filters.businessId ? Prisma.sql`AND ex."businessId" = ${filters.businessId}` : Prisma.sql``}
        GROUP BY ex."businessId"
      ) e ON e."businessId" = b.id
      WHERE 1=1
      ${filters.businessId ? Prisma.sql`AND b.id = ${filters.businessId}` : Prisma.sql``}
      ORDER BY "revenue" DESC, "totalJobs" DESC, b.name ASC
      `
    ),
  ])

  const [activeBusinesses, newBusinesses] = await Promise.all([
    prisma.business.count({
      where: businessScopeWhere({ isActive: true }, filters.businessId),
    }),
    prisma.business.count({
      where: businessScopeWhere({ createdAt: { gte: from, lte: to } }, filters.businessId),
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

export async function getAdminJobsReport(filters: AdminReportFilters) {
  const { from, to } = filters.range
  const grouped = await prisma.workOrder.groupBy({
    by: ['jobStatus'],
    where: businessScopeWhere({ createdAt: { gte: from, lte: to } }, filters.businessId),
    _count: { _all: true },
  })
  const byStatus: Record<string, number> = {}
  let totalJobs = 0
  for (const row of grouped) {
    byStatus[row.jobStatus] = row._count._all
    totalJobs += row._count._all
  }
  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    totalJobs,
    byStatus,
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

export async function getAdminExpensesReport(filters: AdminReportFilters) {
  const { from, to } = filters.range
  const rows = await prisma.$queryRaw<
    Array<{
      totalExpenses: number
      expenseCount: number
      avgExpense: number
    }>
  >(
    Prisma.sql`
    SELECT
      COALESCE(SUM(x.total), 0)::float AS "totalExpenses",
      COUNT(*)::int AS "expenseCount",
      COALESCE(AVG(x.total), 0)::float AS "avgExpense"
    FROM "Expense" x
    WHERE x."date" >= ${from}
      AND x."date" <= ${to}
      ${filters.businessId ? Prisma.sql`AND x."businessId" = ${filters.businessId}` : Prisma.sql``}
    `
  )
  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    ...(rows[0] ?? { totalExpenses: 0, expenseCount: 0, avgExpense: 0 }),
  }
}

export async function getAdminUserActivityReport(filters: AdminReportFilters) {
  const { from, to } = filters.range

  const [sessionRows, auditRows, topActions] = await Promise.all([
    prisma.$queryRaw<Array<{ sessions: number; activeUsers: number }>>(
      Prisma.sql`
      SELECT COUNT(*)::int AS sessions,
             COUNT(DISTINCT s."userId")::int AS "activeUsers"
      FROM "session" s
      LEFT JOIN "User" u ON u.id = s."userId"
      LEFT JOIN "Member" m ON m."userId" = u.id
      WHERE s."createdAt" >= ${from}
        AND s."createdAt" <= ${to}
        ${filters.businessId ? Prisma.sql`AND m."businessId" = ${filters.businessId}` : Prisma.sql``}
      `
    ),
    prisma.$queryRaw<Array<{ auditEvents: number }>>(
      Prisma.sql`
      SELECT COUNT(*)::int AS "auditEvents"
      FROM "AuditLog" a
      WHERE a."createdAt" >= ${from}
        AND a."createdAt" <= ${to}
        ${filters.businessId ? Prisma.sql`AND a."businessId" = ${filters.businessId}` : Prisma.sql``}
      `
    ),
    prisma.$queryRaw<Array<{ action: string; count: number }>>(
      Prisma.sql`
      SELECT a.action AS action, COUNT(*)::int AS count
      FROM "AuditLog" a
      WHERE a."createdAt" >= ${from}
        AND a."createdAt" <= ${to}
        ${filters.businessId ? Prisma.sql`AND a."businessId" = ${filters.businessId}` : Prisma.sql``}
      GROUP BY a.action
      ORDER BY count DESC, a.action ASC
      LIMIT 10
      `
    ),
  ])

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    sessions: sessionRows[0]?.sessions ?? 0,
    activeUsers: sessionRows[0]?.activeUsers ?? 0,
    auditEvents: auditRows[0]?.auditEvents ?? 0,
    topActions,
  }
}

export async function getAdminReportsSummary(filters: AdminReportFilters) {
  const [businesses, jobs, revenue, expenses, userActivity] = await Promise.all([
    getAdminBusinessesReport(filters),
    getAdminJobsReport(filters),
    getAdminRevenueReport(filters),
    getAdminExpensesReport(filters),
    getAdminUserActivityReport(filters),
  ])
  return { businesses, jobs, revenue, expenses, userActivity }
}
