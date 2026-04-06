/**
 * Insights / analytics for the Kellu dashboard (Overview KPIs, Revenue YoY, tabs).
 * Revenue and invoiced value use Invoice rows; quote/job metrics use WorkOrder.
 */

import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'

export type InsightsDatePreset = 'MTD' | 'LAST_MONTH' | 'LAST_30_DAYS' | 'YTD' | 'CUSTOM'

export interface InsightsRange {
  from: Date
  to: Date
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

/** Resolve dashboard range: explicit from/to wins; otherwise preset (default MTD). */
export function resolveInsightsRange(
  preset: InsightsDatePreset | undefined,
  fromStr: string | undefined,
  toStr: string | undefined
): InsightsRange {
  if (fromStr && toStr) {
    return { from: parseDayStartUtc(fromStr), to: parseDayEndUtc(toStr) }
  }

  const p = preset ?? 'MTD'
  const now = new Date()

  if (p === 'CUSTOM') {
    throw new Error('CUSTOM_PRESET_REQUIRES_FROM_TO')
  }

  const end = new Date(now)
  end.setUTCHours(23, 59, 59, 999)

  if (p === 'MTD') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
    return { from, to: end }
  }

  if (p === 'YTD') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0))
    return { from, to: end }
  }

  if (p === 'LAST_30_DAYS') {
    const from = new Date(now.getTime() - 30 * 86_400_000)
    from.setUTCHours(0, 0, 0, 0)
    return { from, to: end }
  }

  // LAST_MONTH — full previous calendar month (UTC)
  const firstThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const lastPrev = new Date(firstThisMonth.getTime() - 86_400_000)
  const y = lastPrev.getUTCFullYear()
  const m = lastPrev.getUTCMonth()
  const from = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0))
  const lastDay = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999))
  return { from, to: lastDay }
}

async function ensureBusiness(businessId: string): Promise<void> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } })
  if (!b) {
    throw new BusinessNotFoundError()
  }
}

function addYears(d: Date, delta: number): Date {
  const x = new Date(d.getTime())
  x.setUTCFullYear(x.getUTCFullYear() + delta)
  return x
}

/** Invoiced revenue: sum Invoice.total (excl. cancelled) by COALESCE(sentAt, createdAt). */
async function sumInvoiceTotalInRange(businessId: string, from: Date, to: Date): Promise<number> {
  const rows = await prisma.$queryRaw<{ total: number }[]>`
    SELECT COALESCE(SUM(i.total), 0)::float AS total
    FROM "Invoice" i
    WHERE i."businessId" = ${businessId}
      AND i.status <> 'CANCELLED'::"InvoiceStatus"
      AND COALESCE(i."sentAt", i."createdAt") >= ${from}
      AND COALESCE(i."sentAt", i."createdAt") <= ${to}
  `
  return rows[0]?.total ?? 0
}

export interface InsightsOverviewResult {
  range: { from: string; to: string }
  convertedQuotes: number
  jobs: number
  invoicedValue: number
}

export async function getInsightsOverview(
  businessId: string,
  range: InsightsRange
): Promise<InsightsOverviewResult> {
  await ensureBusiness(businessId)
  const { from, to } = range

  const [convertedQuotes, jobs, invoicedValue] = await Promise.all([
    prisma.quote.count({
      where: {
        businessId,
        quoteStatus: 'CONVERTED',
        quoteConvertedAt: { gte: from, lte: to },
      },
    }),
    prisma.workOrder.count({
      where: {
        businessId,
        createdAt: { gte: from, lte: to },
        jobStatus: { not: 'CANCELLED' },
      },
    }),
    sumInvoiceTotalInRange(businessId, from, to),
  ])

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    convertedQuotes,
    jobs,
    invoicedValue,
  }
}

export interface RevenueMonthBucket {
  year: number
  month: number
  label: string
  currentYearTotal: number
  priorYearTotal: number
}

export interface InsightsRevenueResult {
  range: { from: string; to: string }
  /** Same calendar window shifted back one year (YoY totals in the legend). */
  priorYearRange: { from: string; to: string }
  totalCurrentRange: number
  totalPriorYearSameRange: number
  byMonth: RevenueMonthBucket[]
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function utcYearMonth(d: Date): { y: number; m: number } {
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }
}

function utcMonthBounds(y: number, month1: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(y, month1 - 1, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(y, month1, 0, 23, 59, 59, 999))
  return { start, end }
}

function clampRange(a: Date, b: Date, from: Date, to: Date): { start: Date; end: Date } | null {
  const start = a > from ? a : from
  const end = b < to ? b : to
  if (start > end) {
    return null
  }
  return { start, end }
}

export async function getInsightsRevenue(
  businessId: string,
  range: InsightsRange
): Promise<InsightsRevenueResult> {
  await ensureBusiness(businessId)
  const { from, to } = range
  const priorFrom = addYears(from, -1)
  const priorTo = addYears(to, -1)

  const [totalCurrentRange, totalPriorYearSameRange] = await Promise.all([
    sumInvoiceTotalInRange(businessId, from, to),
    sumInvoiceTotalInRange(businessId, priorFrom, priorTo),
  ])

  const startYm = utcYearMonth(from)
  const endYm = utcYearMonth(to)
  const byMonth: RevenueMonthBucket[] = []

  let y = startYm.y
  let m = startYm.m
  for (;;) {
    const { start: ms, end: me } = utcMonthBounds(y, m)
    const cur = clampRange(ms, me, from, to)
    const prev = clampRange(addYears(ms, -1), addYears(me, -1), priorFrom, priorTo)

    let currentYearTotal = 0
    let priorYearTotal = 0
    if (cur) {
      currentYearTotal = await sumInvoiceTotalInRange(businessId, cur.start, cur.end)
    }
    if (prev) {
      priorYearTotal = await sumInvoiceTotalInRange(businessId, prev.start, prev.end)
    }

    byMonth.push({
      year: y,
      month: m,
      label: MONTH_LABELS[m - 1] ?? String(m),
      currentYearTotal,
      priorYearTotal,
    })

    if (y === endYm.y && m === endYm.m) {
      break
    }
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    priorYearRange: { from: priorFrom.toISOString(), to: priorTo.toISOString() },
    totalCurrentRange,
    totalPriorYearSameRange,
    byMonth,
  }
}

export interface InsightsLeadConversionResult {
  range: { from: string; to: string }
  /** Work orders created in range — quote funnel snapshot. */
  byQuoteStatus: Record<string, number>
  quotesSentInPeriod: number
  quotesConvertedInPeriod: number
}

export async function getInsightsLeadConversion(
  businessId: string,
  range: InsightsRange
): Promise<InsightsLeadConversionResult> {
  await ensureBusiness(businessId)
  const { from, to } = range

  const [grouped, quotesSentInPeriod, quotesConvertedInPeriod] = await Promise.all([
    prisma.quote.groupBy({
      by: ['quoteStatus'],
      where: { businessId, createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    }),
    prisma.quote.count({
      where: { businessId, quoteSentAt: { gte: from, lte: to } },
    }),
    prisma.quote.count({
      where: { businessId, quoteConvertedAt: { gte: from, lte: to } },
    }),
  ])

  const byQuoteStatus: Record<string, number> = {}
  for (const row of grouped) {
    byQuoteStatus[row.quoteStatus] = row._count._all
  }

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    byQuoteStatus,
    quotesSentInPeriod,
    quotesConvertedInPeriod,
  }
}

export interface InsightsJobsResult {
  range: { from: string; to: string }
  byJobStatus: Record<string, number>
  total: number
}

export async function getInsightsJobs(
  businessId: string,
  range: InsightsRange
): Promise<InsightsJobsResult> {
  await ensureBusiness(businessId)
  const { from, to } = range

  const grouped = await prisma.workOrder.groupBy({
    by: ['jobStatus'],
    where: { businessId, createdAt: { gte: from, lte: to } },
    _count: { _all: true },
  })

  const byJobStatus: Record<string, number> = {}
  let total = 0
  for (const row of grouped) {
    const c = row._count._all
    byJobStatus[row.jobStatus] = c
    total += c
  }

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    byJobStatus,
    total,
  }
}

export interface InvoiceStatusBucket {
  status: string
  count: number
  total: number
}

export interface InsightsInvoicesResult {
  range: { from: string; to: string }
  byStatus: InvoiceStatusBucket[]
  invoicedValue: number
  count: number
}

export async function getInsightsInvoices(
  businessId: string,
  range: InsightsRange
): Promise<InsightsInvoicesResult> {
  await ensureBusiness(businessId)
  const { from, to } = range

  const rows = await prisma.$queryRaw<{ status: string; count: bigint; total: number }[]>`
    SELECT i.status::text AS status,
           COUNT(*)::bigint AS count,
           COALESCE(SUM(i.total), 0)::float AS total
    FROM "Invoice" i
    WHERE i."businessId" = ${businessId}
      AND i.status <> 'CANCELLED'::"InvoiceStatus"
      AND COALESCE(i."sentAt", i."createdAt") >= ${from}
      AND COALESCE(i."sentAt", i."createdAt") <= ${to}
    GROUP BY i.status
    ORDER BY i.status
  `

  const byStatus: InvoiceStatusBucket[] = rows.map(r => ({
    status: r.status,
    count: Number(r.count),
    total: r.total,
  }))

  const invoicedValue = byStatus.reduce((s, b) => s + b.total, 0)
  const count = byStatus.reduce((s, b) => s + b.count, 0)

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    byStatus,
    invoicedValue,
    count,
  }
}
