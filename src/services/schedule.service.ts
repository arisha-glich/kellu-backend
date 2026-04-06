/**
 * Schedule / Calendar Service (§4 Scheduling & Calendar).
 *
 * Key additions over original:
 * - getTeamMembersForSchedule()  → returns all members for daily lane view
 * - getDailySchedule()           → day view: items grouped by assignedToId (technician lanes)
 * - rescheduleItem()             → drag & drop: change date/time/assignee
 * - quickCreateWorkOrder()       → short creation form from calendar
 * - quickCreateTask()            → short task creation from calendar
 * - updateItemSchedule()         → extend/modify time block
 */

import { type Prisma, RolePortalScope } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'

export type ScheduleItemType = 'workorder' | 'task'

export interface ScheduleItem {
  id: string
  type: ScheduleItemType
  title: string
  clientName: string | null
  clientId: string | null
  address: string
  scheduledAt: Date | null
  startTime: string | null
  endTime: string | null
  isAnyTime: boolean
  isScheduleLater: boolean
  assignedToId: string | null
  assignedToName: string | null
  assignedToColor: string | null // for calendar block color by technician
  status: string
  completedAt: Date | null
  workOrderNumber: string | null
  workOrderId: string | null // for tasks linked to a workorder
  quoteStatus: string | null // workorders only
  invoiceStatus: string | null // workorders only
}

export interface TeamMemberLane {
  memberId: string
  name: string
  color: string | null
  items: ScheduleItem[]
}

export interface DailyScheduleResult {
  date: string // YYYY-MM-DD
  unassigned: ScheduleItem[] // no assignedToId, has scheduledAt
  anytime: ScheduleItem[] // isAnyTime = true
  lanes: TeamMemberLane[] // one lane per active team member
  unscheduled: ScheduleItem[] // no scheduledAt at all
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

export interface RescheduleInput {
  scheduledAt?: Date | null
  startTime?: string | null
  endTime?: string | null
  assignedToId?: string | null
  isScheduleLater?: boolean
  isAnyTime?: boolean
}

export interface QuickCreateWorkOrderInput {
  businessId: string
  clientId: string
  title: string
  address: string
  instructions?: string | null
  assignedToId?: string | null
  scheduledAt?: Date | null
  startTime?: string | null
  endTime?: string | null
  isScheduleLater?: boolean
  isAnyTime?: boolean
}

export interface QuickCreateTaskInput {
  businessId: string
  clientId?: string | null
  title: string
  address?: string | null
  instructions?: string | null
  assignedToId?: string | null
  scheduledAt?: Date | null
  startTime?: string | null
  endTime?: string | null
  isAnyTime?: boolean
  workOrderId?: string | null
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

async function ensureBusinessExists(businessId: string): Promise<void> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  })
  if (!b) {
    throw new BusinessNotFoundError()
  }
}

// Derives job status from schedule fields (planning statuses are automatic)
function deriveJobStatus(wo: {
  scheduledAt: Date | null
  assignedToId: string | null
  jobStatus: string
}): string {
  // Execution statuses are manual — don't override them
  const executionStatuses = ['ON_MY_WAY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
  if (executionStatuses.includes(wo.jobStatus)) {
    return wo.jobStatus
  }

  if (!wo.scheduledAt) {
    return 'UNSCHEDULED'
  }
  if (!wo.assignedToId) {
    return 'UNASSIGNED'
  }
  return 'SCHEDULED'
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
  invoiceStatus: string
  completedAt: Date | null
  workOrderNumber: string | null
  clientId: string
  client: { name: string } | null
  assignedTo: {
    user: { name: string | null }
    calendarColor?: string | null
  } | null
}): ScheduleItem {
  return {
    id: wo.id,
    type: 'workorder',
    title: wo.title,
    clientName: wo.client?.name ?? null,
    clientId: wo.clientId,
    address: wo.address,
    scheduledAt: wo.scheduledAt,
    startTime: wo.startTime,
    endTime: wo.endTime,
    isAnyTime: wo.isAnyTime,
    isScheduleLater: wo.isScheduleLater,
    assignedToId: wo.assignedToId,
    assignedToName: wo.assignedTo?.user?.name ?? null,
    assignedToColor: wo.assignedTo?.calendarColor ?? null,
    status: deriveJobStatus(wo),
    completedAt: wo.completedAt,
    workOrderNumber: wo.workOrderNumber,
    workOrderId: null,
    quoteStatus: null,
    invoiceStatus: wo.invoiceStatus,
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
  clientId: string | null
  client: { name: string } | null
  assignedTo: {
    user: { name: string | null }
    calendarColor?: string | null
  } | null
}): ScheduleItem {
  return {
    id: t.id,
    type: 'task',
    title: t.title,
    clientName: t.client?.name ?? null,
    clientId: t.clientId,
    address: t.address ?? '',
    scheduledAt: t.scheduledAt,
    startTime: t.startTime,
    endTime: t.endTime,
    isAnyTime: t.isAnyTime,
    isScheduleLater: false,
    assignedToId: t.assignedToId,
    assignedToName: t.assignedTo?.user?.name ?? null,
    assignedToColor: t.assignedTo?.calendarColor ?? null,
    status: t.taskStatus,
    completedAt: t.completedAt,
    workOrderNumber: null,
    workOrderId: t.workOrderId,
    quoteStatus: null,
    invoiceStatus: null,
  }
}

const WORK_ORDER_INCLUDE = {
  client: { select: { name: true } },
  assignedTo: {
    include: { user: { select: { name: true } } },
  },
} satisfies Prisma.WorkOrderInclude

const TASK_INCLUDE = {
  client: { select: { name: true } },
  assignedTo: {
    include: { user: { select: { name: true } } },
  },
} satisfies Prisma.TaskInclude

// ─────────────────────────────────────────────
// GET TEAM MEMBERS FOR SCHEDULE
// Returns active members with their calendar color for lane rendering
// ─────────────────────────────────────────────

export async function getTeamMembersForSchedule(
  businessId: string
): Promise<{ memberId: string; name: string; color: string | null }[]> {
  await ensureBusinessExists(businessId)

  const members = await prisma.member.findMany({
    where: {
      businessId,
      isActive: true,
      role: { portalScope: RolePortalScope.BUSINESS_PORTAL },
    },
    include: {
      user: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return members.map(m => ({
    memberId: m.id,
    name: m.user.name ?? 'Unknown',
    color: m.calendarColor ?? null,
  }))
}

// ─────────────────────────────────────────────
// GET DAILY SCHEDULE
// Day view: items organized into technician lanes + unassigned + anytime
// ─────────────────────────────────────────────

export async function getDailySchedule(
  businessId: string,
  date: Date,
  filters: {
    type?: 'all' | 'workorder' | 'task'
    teamMemberId?: string | null
  } = {}
): Promise<DailyScheduleResult> {
  await ensureBusinessExists(businessId)

  const { type = 'all', teamMemberId } = filters

  // Day range: full day from 00:00 to 23:59:59
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const dateStr = dayStart.toISOString().split('T')[0]

  // Get active team members for lanes
  const allMembers = await prisma.member.findMany({
    where: {
      businessId,
      isActive: true,
      role: { portalScope: RolePortalScope.BUSINESS_PORTAL },
      ...(teamMemberId ? { id: teamMemberId } : {}),
    },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const _memberIds = allMembers.map(m => m.id)

  const baseWoWhere: Prisma.WorkOrderWhereInput = { businessId }
  const baseTaskWhere: Prisma.TaskWhereInput = { businessId }

  if (teamMemberId) {
    baseWoWhere.assignedToId = teamMemberId
    baseTaskWhere.assignedToId = teamMemberId
  }

  const allScheduledItems: ScheduleItem[] = []
  const unscheduled: ScheduleItem[] = []

  // ── Fetch work orders ──
  if (type === 'workorder' || type === 'all') {
    // Scheduled on this day
    const wos = await prisma.workOrder.findMany({
      where: {
        ...baseWoWhere,
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
      include: WORK_ORDER_INCLUDE,
    })
    allScheduledItems.push(...wos.map(mapWorkOrderToItem))

    // Anytime items for this day
    const _wosAnytime = await prisma.workOrder.findMany({
      where: {
        ...baseWoWhere,
        isAnyTime: true,
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
      include: WORK_ORDER_INCLUDE,
    })
    // These are already in allScheduledItems, will be filtered below

    // Unscheduled (no date at all)
    const wosUnscheduled = await prisma.workOrder.findMany({
      where: {
        ...baseWoWhere,
        scheduledAt: null,
        isScheduleLater: false,
      },
      include: WORK_ORDER_INCLUDE,
    })
    unscheduled.push(...wosUnscheduled.map(mapWorkOrderToItem))
  }

  // ── Fetch tasks ──
  if (type === 'task' || type === 'all') {
    const tasks = await prisma.task.findMany({
      where: {
        ...baseTaskWhere,
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
      include: TASK_INCLUDE,
    })
    allScheduledItems.push(...tasks.map(mapTaskToItem))

    const tasksUnscheduled = await prisma.task.findMany({
      where: {
        ...baseTaskWhere,
        scheduledAt: null,
      },
      include: TASK_INCLUDE,
    })
    unscheduled.push(...tasksUnscheduled.map(mapTaskToItem))
  }

  // ── Split into anytime vs timed ──
  const anytime = allScheduledItems.filter(i => i.isAnyTime)
  const timed = allScheduledItems.filter(i => !i.isAnyTime)

  // ── Split timed into unassigned row vs technician lanes ──
  const unassignedRow = timed.filter(i => !i.assignedToId)

  // Build lanes for each team member
  const lanes: TeamMemberLane[] = allMembers.map(m => {
    const memberItems = timed
      .filter(i => i.assignedToId === m.id)
      .sort((a, b) => {
        if (!a.startTime || !b.startTime) {
          return 0
        }
        return a.startTime.localeCompare(b.startTime)
      })

    return {
      memberId: m.id,
      name: m.user.name ?? 'Unknown',
      color: m.calendarColor ?? null,
      items: memberItems,
    }
  })

  // Sort unassigned by start time
  unassignedRow.sort((a, b) => {
    if (!a.startTime || !b.startTime) {
      return 0
    }
    return a.startTime.localeCompare(b.startTime)
  })

  return {
    date: dateStr,
    unassigned: unassignedRow,
    anytime,
    lanes,
    unscheduled,
  }
}

// ─────────────────────────────────────────────
// GET SCHEDULE ITEMS  (week/month range view)
// ─────────────────────────────────────────────

export async function getScheduleItems(
  businessId: string,
  filters: ScheduleFilters
): Promise<ScheduleResult> {
  await ensureBusinessExists(businessId)

  const { start, end, type = 'all', teamMemberId, includeUnscheduled = true } = filters

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
    const wos = await prisma.workOrder.findMany({
      where: { ...woWhere, scheduledAt: { gte: start, lt: dayAfterEnd } },
      include: WORK_ORDER_INCLUDE,
    })
    scheduled.push(...wos.map(mapWorkOrderToItem))

    if (includeUnscheduled) {
      const wosU = await prisma.workOrder.findMany({
        where: { ...woWhere, scheduledAt: null },
        include: WORK_ORDER_INCLUDE,
      })
      unscheduled.push(...wosU.map(mapWorkOrderToItem))
    }
  }

  if (type === 'task' || type === 'all') {
    const tasks = await prisma.task.findMany({
      where: { ...taskWhere, scheduledAt: { gte: start, lt: dayAfterEnd } },
      include: TASK_INCLUDE,
    })
    scheduled.push(...tasks.map(mapTaskToItem))

    if (includeUnscheduled) {
      const tasksU = await prisma.task.findMany({
        where: { ...taskWhere, scheduledAt: null },
        include: TASK_INCLUDE,
      })
      unscheduled.push(...tasksU.map(mapTaskToItem))
    }
  }

  scheduled.sort((a, b) => {
    if (!a.scheduledAt && !b.scheduledAt) {
      return 0
    }
    if (!a.scheduledAt) {
      return 1
    }
    if (!b.scheduledAt) {
      return -1
    }
    return a.scheduledAt.getTime() - b.scheduledAt.getTime()
  })

  return { scheduled, unscheduled }
}

// ─────────────────────────────────────────────
// RESCHEDULE  (drag & drop between technicians / time slots)
// ─────────────────────────────────────────────

export async function rescheduleItem(
  businessId: string,
  itemId: string,
  itemType: ScheduleItemType,
  input: RescheduleInput
): Promise<ScheduleItem> {
  await ensureBusinessExists(businessId)

  if (itemType === 'workorder') {
    // Verify belongs to business
    const wo = await prisma.workOrder.findFirst({
      where: { id: itemId, businessId },
      select: { id: true, jobStatus: true },
    })
    if (!wo) {
      throw new Error('Work order not found')
    }

    // Cannot reschedule completed or cancelled
    if (['COMPLETED', 'CANCELLED'].includes(wo.jobStatus)) {
      throw new Error('Cannot reschedule a completed or cancelled work order')
    }

    const updateData: Prisma.WorkOrderUpdateInput = {}
    if (input.scheduledAt !== undefined) {
      updateData.scheduledAt = input.scheduledAt
    }
    if (input.startTime !== undefined) {
      updateData.startTime = input.startTime
    }
    if (input.endTime !== undefined) {
      updateData.endTime = input.endTime
    }
    if (input.isAnyTime !== undefined) {
      updateData.isAnyTime = input.isAnyTime
    }
    if (input.isScheduleLater !== undefined) {
      updateData.isScheduleLater = input.isScheduleLater
    }
    if (input.assignedToId !== undefined) {
      updateData.assignedTo = input.assignedToId
        ? { connect: { id: input.assignedToId } }
        : { disconnect: true }
    }

    const updated = await prisma.workOrder.update({
      where: { id: itemId },
      data: updateData,
      include: WORK_ORDER_INCLUDE,
    })

    return mapWorkOrderToItem(updated)
  } else {
    const task = await prisma.task.findFirst({
      where: { id: itemId, businessId },
      select: { id: true, taskStatus: true },
    })
    if (!task) {
      throw new Error('Task not found')
    }

    if (task.taskStatus === 'COMPLETED') {
      throw new Error('Cannot reschedule a completed task')
    }

    const updateData: Prisma.TaskUpdateInput = {}
    if (input.scheduledAt !== undefined) {
      updateData.scheduledAt = input.scheduledAt
    }
    if (input.startTime !== undefined) {
      updateData.startTime = input.startTime
    }
    if (input.endTime !== undefined) {
      updateData.endTime = input.endTime
    }
    if (input.isAnyTime !== undefined) {
      updateData.isAnyTime = input.isAnyTime
    }
    if (input.assignedToId !== undefined) {
      updateData.assignedTo = input.assignedToId
        ? { connect: { id: input.assignedToId } }
        : { disconnect: true }
    }

    const updated = await prisma.task.update({
      where: { id: itemId },
      data: updateData,
      include: TASK_INCLUDE,
    })

    return mapTaskToItem(updated)
  }
}

// ─────────────────────────────────────────────
// QUICK CREATE WORK ORDER  (short form from calendar)
// ─────────────────────────────────────────────

export async function quickCreateWorkOrder(
  input: QuickCreateWorkOrderInput
): Promise<ScheduleItem> {
  const {
    businessId,
    clientId,
    title,
    address,
    instructions,
    assignedToId,
    scheduledAt,
    startTime,
    endTime,
    isScheduleLater = false,
    isAnyTime = false,
  } = input

  await ensureBusinessExists(businessId)

  // Verify client belongs to business
  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId },
    select: { id: true },
  })
  if (!client) {
    throw new Error('Client not found')
  }

  // Generate work order number
  const count = await prisma.workOrder.count({ where: { businessId } })
  const workOrderNumber = `#${count + 1}`

  // Determine initial job status from schedule fields
  let jobStatus: 'UNSCHEDULED' | 'UNASSIGNED' | 'SCHEDULED' = 'UNSCHEDULED'
  if (scheduledAt && assignedToId) {
    jobStatus = 'SCHEDULED'
  } else if (scheduledAt) {
    jobStatus = 'UNASSIGNED'
  }

  const wo = await prisma.workOrder.create({
    data: {
      businessId,
      clientId,
      title,
      address,
      instructions: instructions ?? null,
      workOrderNumber,
      scheduledAt: scheduledAt ?? null,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
      isScheduleLater,
      isAnyTime,
      jobStatus,
      ...(assignedToId ? { assignedToId } : {}),
    },
    include: WORK_ORDER_INCLUDE,
  })

  return mapWorkOrderToItem(wo)
}

// ─────────────────────────────────────────────
// QUICK CREATE TASK  (short form from calendar)
// Standalone tasks are not linked to a work order
// ─────────────────────────────────────────────

export async function quickCreateTask(input: QuickCreateTaskInput): Promise<ScheduleItem> {
  const {
    businessId,
    clientId,
    title,
    address,
    instructions,
    assignedToId,
    scheduledAt,
    startTime,
    endTime,
    isAnyTime = false,
    workOrderId,
  } = input

  await ensureBusinessExists(businessId)

  const task = await prisma.task.create({
    data: {
      businessId,
      title,
      address: address ?? null,
      instructions: instructions ?? null,
      scheduledAt: scheduledAt ?? null,
      startTime: startTime ?? null,
      endTime: endTime ?? null,
      isAnyTime,
      taskStatus: 'SCHEDULED',
      ...(clientId ? { clientId } : {}),
      ...(assignedToId ? { assignedToId } : {}),
      ...(workOrderId ? { workOrderId } : {}),
    },
    include: TASK_INCLUDE,
  })

  return mapTaskToItem(task)
}
