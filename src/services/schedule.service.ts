/**
 * Schedule / Calendar API (§4 Scheduling & Calendar).
 * Returns work orders and tasks for a date range, with filters (type, team member).
 * Supports scheduled items (with date/time) and unscheduled items (no date).
 */

import type { Prisma } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'

export type ScheduleItemType = 'workorder' | 'task'

export interface ScheduleItem {
  id: string
  type: ScheduleItemType
  title: string
  clientName: string | null
  address: string
  scheduledAt: Date | null
  startTime: string | null
  endTime: string | null
  isAnyTime: boolean
  isScheduleLater: boolean
  assignedToId: string | null
  assignedToName: string | null
  status: string
  completedAt: Date | null
  workOrderNumber: string | null
  workOrderId: string | null
}

export interface ScheduleFilters {
  start: Date
  end: Date
  type?: 'all' | 'workorder' | 'task'
  teamMemberId?: string | null
  includeUnscheduled?: boolean
}

export interface ScheduleResult {
  scheduled: ScheduleItem[]
  unscheduled: ScheduleItem[]
}

async function ensureBusinessExists(businessId: string): Promise<void> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  })
  if (!b) throw new BusinessNotFoundError()
}

function mapWorkOrderToItem(wo: {
  id: string
  title: string
  address: string
  scheduledAt: Date | null
  startTime: string | null
  endTime: string | null
  isScheduleLater: boolean
  isAnyTime: boolean
  assignedToId: string | null
  jobStatus: string
  completedAt: Date | null
  workOrderNumber: string | null
  client: { name: string } | null
  assignedTo: { user: { name: string | null } } | null
}): ScheduleItem {
  return {
    id: wo.id,
    type: 'workorder',
    title: wo.title,
    clientName: wo.client?.name ?? null,
    address: wo.address,
    scheduledAt: wo.scheduledAt,
    startTime: wo.startTime,
    endTime: wo.endTime,
    isAnyTime: wo.isAnyTime,
    isScheduleLater: wo.isScheduleLater,
    assignedToId: wo.assignedToId,
    assignedToName: wo.assignedTo?.user?.name ?? null,
    status: wo.jobStatus,
    completedAt: wo.completedAt,
    workOrderNumber: wo.workOrderNumber,
    workOrderId: null,
  }
}

function mapTaskToItem(t: {
  id: string
  title: string
  address: string | null
  scheduledAt: Date | null
  startTime: string | null
  endTime: string | null
  isAnyTime: boolean
  assignedToId: string | null
  taskStatus: string
  completedAt: Date | null
  workOrderId: string | null
  client: { name: string } | null
  assignedTo: { user: { name: string | null } } | null
}): ScheduleItem {
  return {
    id: t.id,
    type: 'task',
    title: t.title,
    clientName: t.client?.name ?? null,
    address: t.address ?? '',
    scheduledAt: t.scheduledAt,
    startTime: t.startTime,
    endTime: t.endTime,
    isAnyTime: t.isAnyTime,
    isScheduleLater: false,
    assignedToId: t.assignedToId,
    assignedToName: t.assignedTo?.user?.name ?? null,
    status: t.taskStatus,
    completedAt: t.completedAt,
    workOrderNumber: null,
    workOrderId: t.workOrderId,
  }
}

/**
 * Get schedule items (work orders + tasks) for a date range.
 * Optional filters: type (workorder | task | all), teamMemberId.
 * Returns scheduled (with date in range) and unscheduled (no date) lists.
 */
export async function getScheduleItems(
  businessId: string,
  filters: ScheduleFilters
): Promise<ScheduleResult> {
  await ensureBusinessExists(businessId)

  const {
    start,
    end,
    type = 'all',
    teamMemberId,
    includeUnscheduled = true,
  } = filters

  const dayAfterEnd = new Date(end)
  dayAfterEnd.setDate(dayAfterEnd.getDate() + 1)

  const scheduled: ScheduleItem[] = []
  const unscheduled: ScheduleItem[] = []

  const woWhere: Prisma.WorkOrderWhereInput = { businessId }
  const taskWhere: Prisma.TaskWhereInput = { businessId }
  if (teamMemberId) {
    woWhere.assignedToId = teamMemberId
    taskWhere.assignedToId = teamMemberId
  }

  if (type === 'workorder' || type === 'all') {
    const workOrdersScheduled = await prisma.workOrder.findMany({
      where: {
        ...woWhere,
        scheduledAt: { gte: start, lt: dayAfterEnd },
      },
      include: {
        client: { select: { name: true } },
        assignedTo: { include: { user: { select: { name: true } } } },
      },
    })
    scheduled.push(...workOrdersScheduled.map(mapWorkOrderToItem))

    if (includeUnscheduled) {
      const workOrdersUnscheduled = await prisma.workOrder.findMany({
        where: {
          ...woWhere,
          scheduledAt: null,
        },
        include: {
          client: { select: { name: true } },
          assignedTo: { include: { user: { select: { name: true } } } },
        },
      })
      unscheduled.push(...workOrdersUnscheduled.map(mapWorkOrderToItem))
    }
  }

  if (type === 'task' || type === 'all') {
    const tasksScheduled = await prisma.task.findMany({
      where: {
        ...taskWhere,
        scheduledAt: { gte: start, lt: dayAfterEnd },
      },
      include: {
        client: { select: { name: true } },
        assignedTo: { include: { user: { select: { name: true } } } },
      },
    })
    scheduled.push(...tasksScheduled.map(mapTaskToItem))

    if (includeUnscheduled) {
      const tasksUnscheduled = await prisma.task.findMany({
        where: {
          ...taskWhere,
          scheduledAt: null,
        },
        include: {
          client: { select: { name: true } },
          assignedTo: { include: { user: { select: { name: true } } } },
        },
      })
      unscheduled.push(...tasksUnscheduled.map(mapTaskToItem))
    }
  }

  scheduled.sort((a, b) => {
    if (!a.scheduledAt && !b.scheduledAt) return 0
    if (!a.scheduledAt) return 1
    if (!b.scheduledAt) return -1
    return a.scheduledAt.getTime() - b.scheduledAt.getTime()
  })

  return { scheduled, unscheduled }
}
