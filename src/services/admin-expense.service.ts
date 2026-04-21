import type { Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'

export type AdminExpenseCategory = 'GENERAL' | 'WORK_ORDER'
export type AdminExpenseStatus = 'UNBILLED' | 'INVOICED'

export interface AdminExpenseDashboardFilters {
  businessId?: string
  category?: AdminExpenseCategory | 'ALL'
  status?: AdminExpenseStatus | 'ALL'
  search?: string
  page?: number
  limit?: number
}

function toNumber(value: unknown): number {
  if (value == null) {
    return 0
  }
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string') {
    return Number.parseFloat(value) || 0
  }
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber()
  }
  return 0
}

function buildExpenseWhere(filters: AdminExpenseDashboardFilters): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = {}

  if (filters.businessId) {
    where.businessId = filters.businessId
  }

  if (filters.category === 'GENERAL') {
    where.workOrderId = null
  } else if (filters.category === 'WORK_ORDER') {
    where.workOrderId = { not: null }
  }

  if (filters.status === 'INVOICED') {
    where.invoiceNumber = { not: null }
  } else if (filters.status === 'UNBILLED') {
    where.OR = [{ invoiceNumber: null }, { invoiceNumber: '' }]
  }

  const term = filters.search?.trim()
  if (term) {
    const existingAnd = where.AND == null ? [] : Array.isArray(where.AND) ? where.AND : [where.AND]
    where.AND = [
      ...existingAnd,
      {
        OR: [
          { itemName: { contains: term, mode: 'insensitive' } },
          { details: { contains: term, mode: 'insensitive' } },
          { invoiceNumber: { contains: term, mode: 'insensitive' } },
          { business: { name: { contains: term, mode: 'insensitive' } } },
        ],
      },
    ]
  }

  return where
}

function deriveExpenseCategory(workOrderId: string | null): AdminExpenseCategory {
  return workOrderId ? 'WORK_ORDER' : 'GENERAL'
}

function deriveExpenseStatus(invoiceNumber: string | null): AdminExpenseStatus {
  return invoiceNumber?.trim() ? 'INVOICED' : 'UNBILLED'
}

export async function getAdminExpensesDashboard(filters: AdminExpenseDashboardFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.max(1, Math.min(filters.limit ?? 20, 100))
  const skip = (page - 1) * limit

  const where = buildExpenseWhere(filters)
  const startOfYear = new Date(new Date().getFullYear(), 0, 1)
  const endOfYear = new Date(new Date().getFullYear(), 11, 31, 23, 59, 59, 999)

  const [items, total, sumAll, thisYearCount, businesses] = await Promise.all([
    prisma.expense.findMany({
      where,
      skip,
      take: limit,
      orderBy: { date: 'desc' },
      select: {
        id: true,
        itemName: true,
        details: true,
        total: true,
        date: true,
        invoiceNumber: true,
        workOrderId: true,
        business: { select: { id: true, name: true } },
      },
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({
      where: filters.businessId ? { businessId: filters.businessId } : {},
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.expense.count({
      where: {
        ...(filters.businessId ? { businessId: filters.businessId } : {}),
        date: { gte: startOfYear, lte: endOfYear },
      },
    }),
    prisma.business.findMany({
      where: filters.businessId ? { id: filters.businessId } : undefined,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const totalExpenses = toNumber(sumAll._sum.total)
  const averageExpense = sumAll._count._all > 0 ? totalExpenses / sumAll._count._all : 0

  return {
    overview: {
      thisYearExpenses: thisYearCount,
      totalExpenses,
      averageExpense,
    },
    expenses: items.map(item => ({
      id: item.id,
      business: item.business,
      category: deriveExpenseCategory(item.workOrderId),
      description: item.details ?? item.itemName,
      amount: toNumber(item.total),
      status: deriveExpenseStatus(item.invoiceNumber),
      date: item.date,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    businessOptions: businesses,
  }
  //comment out some code
}
