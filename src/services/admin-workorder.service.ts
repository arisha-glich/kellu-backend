import type { JobStatus, Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'

export type AdminWorkorderUiStatus = 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'CANCELED'

export interface AdminWorkorderListFilters {
  businessId?: string
  search?: string
  status?: AdminWorkorderUiStatus | 'ALL'
  page?: number
  limit?: number
}

const ACTIVE_STATUSES: JobStatus[] = ['ON_MY_WAY', 'IN_PROGRESS']
const PENDING_STATUSES: JobStatus[] = ['UNSCHEDULED', 'UNASSIGNED', 'SCHEDULED']
const COMPLETED_STATUSES: JobStatus[] = ['COMPLETED']
const CANCELED_STATUSES: JobStatus[] = ['CANCELLED']

const UI_STATUS_TO_JOB_STATUS: Record<AdminWorkorderUiStatus, JobStatus[]> = {
  ACTIVE: ACTIVE_STATUSES,
  PENDING: PENDING_STATUSES,
  COMPLETED: COMPLETED_STATUSES,
  CANCELED: CANCELED_STATUSES,
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

function toUiStatus(jobStatus: JobStatus): AdminWorkorderUiStatus {
  if (ACTIVE_STATUSES.includes(jobStatus)) {
    return 'ACTIVE'
  }
  if (PENDING_STATUSES.includes(jobStatus)) {
    return 'PENDING'
  }
  if (COMPLETED_STATUSES.includes(jobStatus)) {
    return 'COMPLETED'
  }
  return 'CANCELED'
}

function buildBaseWhereInput(filters: AdminWorkorderListFilters): Prisma.WorkOrderWhereInput {
  const where: Prisma.WorkOrderWhereInput = {}

  if (filters.businessId) {
    where.businessId = filters.businessId
  }

  const term = filters.search?.trim()
  if (term) {
    where.OR = [
      { workOrderNumber: { contains: term, mode: 'insensitive' } },
      { title: { contains: term, mode: 'insensitive' } },
      {
        client: {
          name: { contains: term, mode: 'insensitive' },
          email: { contains: term, mode: 'insensitive' },
          phone: { contains: term, mode: 'insensitive' },
        },
      },
      { business: { name: { contains: term, mode: 'insensitive' } } },
    ]
  }

  return where
}

export async function getAdminWorkordersDashboard(filters: AdminWorkorderListFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.max(1, Math.min(filters.limit ?? 10, 100))
  const skip = (page - 1) * limit

  const baseWhere = buildBaseWhereInput(filters)
  const listWhere: Prisma.WorkOrderWhereInput = { ...baseWhere }

  if (filters.status && filters.status !== 'ALL') {
    listWhere.jobStatus = { in: UI_STATUS_TO_JOB_STATUS[filters.status] }
  }

  const [workorders, total, grouped, aggregate, businesses] = await Promise.all([
    prisma.workOrder.findMany({
      where: listWhere,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        workOrderNumber: true,
        title: true,
        createdAt: true,
        jobStatus: true,
        total: true,
        client: { select: { id: true, name: true, email: true, phone: true, address: true } },
        business: { select: { id: true, name: true } },
      },
    }),
    prisma.workOrder.count({ where: listWhere }),
    prisma.workOrder.groupBy({
      by: ['jobStatus'],
      where: baseWhere,
      _count: { _all: true },
    }),
    prisma.workOrder.aggregate({
      where: baseWhere,
      _sum: { total: true },
    }),
    prisma.business.findMany({
      where: filters.businessId ? { id: filters.businessId } : undefined,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const overview = {
    activeWorkorders: {
      active: 0,
      pending: 0,
    },
    completedWorkorders: 0,
    canceledWorkorders: 0,
    totalValue: toNumber(aggregate._sum.total),
  }

  for (const row of grouped) {
    if (ACTIVE_STATUSES.includes(row.jobStatus)) {
      overview.activeWorkorders.active += row._count._all
      continue
    }
    if (PENDING_STATUSES.includes(row.jobStatus)) {
      overview.activeWorkorders.pending += row._count._all
      continue
    }
    if (COMPLETED_STATUSES.includes(row.jobStatus)) {
      overview.completedWorkorders += row._count._all
      continue
    }
    if (CANCELED_STATUSES.includes(row.jobStatus)) {
      overview.canceledWorkorders += row._count._all
    }
  }

  return {
    overview,
    workorders: workorders.map(item => ({
      id: item.id,
      workOrderId: item.workOrderNumber ?? item.id,
      business: item.business,
      client: item.client,
      title: item.title,
      status: toUiStatus(item.jobStatus),
      amount: toNumber(item.total),
      createdAt: item.createdAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    businessOptions: businesses,
  }
}
