/**
 * Schedule / Calendar Service (§4 Scheduling & Calendar).
 *
 * Key additions over original:
 * - getTeamMembersForSchedule()  → returns all members for daily lane view
 * - getDailySchedule()           → day view: items grouped by assignedToId (technician lanes)
 * - rescheduleItem()             → drag & drop: change date/time/assignee (skips duplicate reschedule emails when unchanged or right after create)
 * - quickCreateWorkOrder()       → short creation form from calendar
 * - quickCreateTask()            → short task creation from calendar
 * - updateItemSchedule()         → extend/modify time block
 */

import { type Prisma, RolePortalScope } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'
import {
  sendTaskAssignedToTeamMemberEmail,
  sendTaskCreatedEmail,
  sendTaskRescheduledEmail,
  sendWorkOrderAssignedToTeamMemberEmail,
  sendWorkOrderCreatedEmail,
  sendWorkOrderRescheduledEmail,
} from '~/services/email-helpers'
import { createUserNotification, sendUserOperationEmail } from '~/services/notifications.service'

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
  primaryAssigneeId: string | null
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
  if (!wo.primaryAssigneeId) {
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
  primaryAssigneeId: string | null
  jobStatus: string
  invoiceStatus: string
  completedAt: Date | null
  workOrderNumber: string | null
  clientId: string
  client: { name: string } | null
  primaryAssignee: {
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
    assignedToId: wo.primaryAssigneeId,
    assignedToName: wo.primaryAssignee?.user?.name ?? null,
    assignedToColor: wo.primaryAssignee?.calendarColor ?? null,
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
  primaryAssignee: {
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
    baseWoWhere.primaryAssigneeId = teamMemberId
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
    woWhere.primaryAssigneeId = teamMemberId
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

/** Skip "rescheduled" emails when the client syncs the calendar seconds after create (same UX as single "created" email). */
const POST_CREATE_RESCHEDULE_GRACE_MS = 120_000

export interface RescheduleItemResult {
  item: ScheduleItem
  /** When false, skip client/business reschedule notifications (no-op update or post-create first scheduling). */
  shouldNotifyReschedule: boolean
}

type WorkOrderScheduleSnapshot = {
  scheduledAt: Date | null
  startTime: string | null
  endTime: string | null
  isAnyTime: boolean
  isScheduleLater: boolean
  primaryAssigneeId: string | null
}

type TaskScheduleSnapshot = {
  scheduledAt: Date | null
  startTime: string | null
  endTime: string | null
  isAnyTime: boolean
  assignedToId: string | null
}

function workOrderScheduleFingerprint(s: WorkOrderScheduleSnapshot): string {
  const t = s.scheduledAt ? s.scheduledAt.getTime() : ''
  return [
    t,
    (s.startTime ?? '').trim(),
    (s.endTime ?? '').trim(),
    s.isAnyTime ? '1' : '0',
    s.isScheduleLater ? '1' : '0',
    s.primaryAssigneeId ?? '',
  ].join('\t')
}

function taskScheduleFingerprint(s: TaskScheduleSnapshot): string {
  const t = s.scheduledAt ? s.scheduledAt.getTime() : ''
  return [
    t,
    (s.startTime ?? '').trim(),
    (s.endTime ?? '').trim(),
    s.isAnyTime ? '1' : '0',
    s.assignedToId ?? '',
  ].join('\t')
}

function mergeWorkOrderReschedule(
  existing: WorkOrderScheduleSnapshot,
  input: RescheduleInput
): WorkOrderScheduleSnapshot {
  return {
    scheduledAt: input.scheduledAt !== undefined ? input.scheduledAt : existing.scheduledAt,
    startTime: input.startTime !== undefined ? input.startTime : existing.startTime,
    endTime: input.endTime !== undefined ? input.endTime : existing.endTime,
    isAnyTime: input.isAnyTime !== undefined ? input.isAnyTime : existing.isAnyTime,
    isScheduleLater:
      input.isScheduleLater !== undefined ? input.isScheduleLater : existing.isScheduleLater,
    primaryAssigneeId:
      input.assignedToId !== undefined ? input.assignedToId : existing.primaryAssigneeId,
  }
}

function mergeTaskReschedule(
  existing: TaskScheduleSnapshot,
  input: RescheduleInput
): TaskScheduleSnapshot {
  return {
    scheduledAt: input.scheduledAt !== undefined ? input.scheduledAt : existing.scheduledAt,
    startTime: input.startTime !== undefined ? input.startTime : existing.startTime,
    endTime: input.endTime !== undefined ? input.endTime : existing.endTime,
    isAnyTime: input.isAnyTime !== undefined ? input.isAnyTime : existing.isAnyTime,
    assignedToId: input.assignedToId !== undefined ? input.assignedToId : existing.assignedToId,
  }
}

function workOrderScheduleWasBare(s: WorkOrderScheduleSnapshot): boolean {
  return (
    s.scheduledAt == null &&
    s.primaryAssigneeId == null &&
    !s.startTime?.trim() &&
    !s.endTime?.trim()
  )
}

function taskScheduleWasBare(s: TaskScheduleSnapshot): boolean {
  return (
    s.scheduledAt == null && s.assignedToId == null && !s.startTime?.trim() && !s.endTime?.trim()
  )
}

function shouldSendRescheduleNotificationsWorkOrder(
  before: WorkOrderScheduleSnapshot,
  merged: WorkOrderScheduleSnapshot,
  createdAt: Date
): boolean {
  const fpBefore = workOrderScheduleFingerprint(before)
  const fpAfter = workOrderScheduleFingerprint(merged)
  if (fpBefore === fpAfter) {
    return false
  }
  const withinGrace = Date.now() - createdAt.getTime() < POST_CREATE_RESCHEDULE_GRACE_MS
  if (withinGrace && workOrderScheduleWasBare(before) && !workOrderScheduleWasBare(merged)) {
    return false
  }
  return true
}

function shouldSendRescheduleNotificationsTask(
  before: TaskScheduleSnapshot,
  merged: TaskScheduleSnapshot,
  createdAt: Date
): boolean {
  const fpBefore = taskScheduleFingerprint(before)
  const fpAfter = taskScheduleFingerprint(merged)
  if (fpBefore === fpAfter) {
    return false
  }
  const withinGrace = Date.now() - createdAt.getTime() < POST_CREATE_RESCHEDULE_GRACE_MS
  if (withinGrace && taskScheduleWasBare(before) && !taskScheduleWasBare(merged)) {
    return false
  }
  return true
}

async function rescheduleWorkOrderItemInner(
  businessId: string,
  itemId: string,
  input: RescheduleInput
): Promise<RescheduleItemResult> {
  const wo = await prisma.workOrder.findFirst({
    where: { id: itemId, businessId },
    select: {
      id: true,
      jobStatus: true,
      createdAt: true,
      scheduledAt: true,
      startTime: true,
      endTime: true,
      isAnyTime: true,
      isScheduleLater: true,
      primaryAssigneeId: true,
    },
  })
  if (!wo) {
    throw new Error('Work order not found')
  }

  if (['COMPLETED', 'CANCELLED'].includes(wo.jobStatus)) {
    throw new Error('Cannot reschedule a completed or cancelled work order')
  }

  const beforeSnap: WorkOrderScheduleSnapshot = {
    scheduledAt: wo.scheduledAt,
    startTime: wo.startTime,
    endTime: wo.endTime,
    isAnyTime: wo.isAnyTime,
    isScheduleLater: wo.isScheduleLater,
    primaryAssigneeId: wo.primaryAssigneeId,
  }
  const merged = mergeWorkOrderReschedule(beforeSnap, input)
  const shouldNotifyReschedule = shouldSendRescheduleNotificationsWorkOrder(
    beforeSnap,
    merged,
    wo.createdAt
  )

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
    updateData.primaryAssignee = input.assignedToId
      ? { connect: { id: input.assignedToId } }
      : { disconnect: true }
  }

  const updated = await prisma.workOrder.update({
    where: { id: itemId },
    data: updateData,
    include: WORK_ORDER_INCLUDE,
  })

  return { item: mapWorkOrderToItem(updated), shouldNotifyReschedule }
}

async function rescheduleTaskItemInner(
  businessId: string,
  itemId: string,
  input: RescheduleInput
): Promise<RescheduleItemResult> {
  const task = await prisma.task.findFirst({
    where: { id: itemId, businessId },
    select: {
      id: true,
      taskStatus: true,
      createdAt: true,
      scheduledAt: true,
      startTime: true,
      endTime: true,
      isAnyTime: true,
      assignedToId: true,
    },
  })
  if (!task) {
    throw new Error('Task not found')
  }

  if (task.taskStatus === 'COMPLETED') {
    throw new Error('Cannot reschedule a completed task')
  }

  const beforeSnap: TaskScheduleSnapshot = {
    scheduledAt: task.scheduledAt,
    startTime: task.startTime,
    endTime: task.endTime,
    isAnyTime: task.isAnyTime,
    assignedToId: task.assignedToId,
  }
  const merged = mergeTaskReschedule(beforeSnap, input)
  const shouldNotifyReschedule = shouldSendRescheduleNotificationsTask(
    beforeSnap,
    merged,
    task.createdAt
  )

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

  return { item: mapTaskToItem(updated), shouldNotifyReschedule }
}

export async function rescheduleItem(
  businessId: string,
  itemId: string,
  itemType: ScheduleItemType,
  input: RescheduleInput
): Promise<RescheduleItemResult> {
  await ensureBusinessExists(businessId)
  if (itemType === 'workorder') {
    return rescheduleWorkOrderItemInner(businessId, itemId, input)
  }
  return rescheduleTaskItemInner(businessId, itemId, input)
}

/** Display date for customer emails (e.g. "January 15, 2024"). */
function formatScheduleEmailDate(d: Date | null): string {
  if (!d) {
    return 'To be confirmed'
  }
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Normalize a time value for display as "HH:mm". Handles ISO datetime strings and plain "09:00" strings.
 */
function normalizeTimeDisplay(value: string | null | undefined): string | null {
  if (value == null || String(value).trim() === '') {
    return null
  }
  const s = String(value).trim()
  const date = new Date(s)
  if (!Number.isNaN(date.getTime()) && s.includes('T')) {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(s)) {
    return s.length === 5 ? s : s.slice(0, 5)
  }
  return s
}

/** Format time range (e.g. "09:00 - 11:00"). Uses scheduledAt when start/end are missing. */
function formatScheduleTimeRange(
  start: string | null,
  end: string | null,
  scheduledAt?: Date | null
): string {
  const startNorm = normalizeTimeDisplay(start)
  const endNorm = normalizeTimeDisplay(end)
  if (startNorm && endNorm) {
    return `${startNorm} - ${endNorm}`
  }
  if (startNorm || endNorm) {
    return startNorm ?? endNorm ?? 'To be confirmed'
  }
  if (scheduledAt) {
    return scheduledAt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }
  return 'To be confirmed'
}

type ScheduleRescheduleActingUser = { id: string; email?: string | null; name: string | null }

async function notifyWorkOrderRescheduleSideEffects(
  businessId: string,
  workOrderId: string,
  actingUser: ScheduleRescheduleActingUser
): Promise<void> {
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    include: {
      client: { select: { name: true, email: true } },
      primaryAssignee: { include: { user: { select: { name: true } } } },
      business: { include: { settings: { select: { replyToEmail: true } } } },
    },
  })
  if (!wo) {
    return
  }

  const dateStr = formatScheduleEmailDate(wo.scheduledAt)
  const timeRangeStr = wo.isAnyTime
    ? 'Anytime'
    : formatScheduleTimeRange(wo.startTime, wo.endTime, wo.scheduledAt)
  const assignedName = wo.primaryAssignee?.user?.name ?? 'Our team'
  const companyReplyTo = wo.business.settings?.replyToEmail?.trim() || wo.business.email

  const clientEmail = wo.client.email?.trim()
  if (clientEmail) {
    sendWorkOrderRescheduledEmail({
      to: clientEmail,
      clientName: wo.client.name,
      businessName: wo.business.name,
      companyReplyTo,
      companyLogoUrl: wo.business.logoUrl ?? undefined,
      workOrderNumber: wo.workOrderNumber ?? `#${wo.id}`,
      title: wo.title,
      address: wo.address ?? '',
      date: dateStr,
      timeRange: timeRangeStr,
      assignedTeamMemberName: assignedName,
      instructions: wo.instructions,
    })
  }

  await createUserNotification({
    userId: actingUser.id,
    type: 'WORKORDER_RESCHEDULED',
    title: `Work order rescheduled - ${wo.title}`,
    message: `${wo.workOrderNumber ?? 'Work order'} · ${dateStr} · ${timeRangeStr}`,
    metadata: {
      workOrderId: wo.id,
      workOrderNumber: wo.workOrderNumber,
      clientName: wo.client.name,
    },
  })

  const ownerEmail = actingUser.email?.trim()
  if (ownerEmail) {
    await sendUserOperationEmail({
      to: ownerEmail,
      userName: actingUser.name,
      actionTitle: 'Work order schedule updated',
      actionMessage: `"${wo.title}" was rescheduled. The client was emailed if an email is on file.`,
    })
  }
}

async function notifyTaskRescheduleSideEffects(
  businessId: string,
  taskId: string,
  actingUser: ScheduleRescheduleActingUser
): Promise<void> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, businessId },
    include: {
      client: { select: { name: true, email: true } },
      assignedTo: { include: { user: { select: { name: true } } } },
      business: { include: { settings: { select: { replyToEmail: true } } } },
    },
  })
  if (!task) {
    return
  }

  const dateStr = formatScheduleEmailDate(task.scheduledAt)
  const timeRangeStr = task.isAnyTime
    ? 'Anytime'
    : formatScheduleTimeRange(task.startTime, task.endTime, task.scheduledAt)
  const assignedName = task.assignedTo?.user?.name ?? 'Our team'
  const companyReplyTo = task.business.settings?.replyToEmail?.trim() || task.business.email

  const clientEmail = task.client?.email?.trim()
  if (clientEmail && task.client) {
    sendTaskRescheduledEmail({
      to: clientEmail,
      clientName: task.client.name,
      businessName: task.business.name,
      companyReplyTo,
      companyLogoUrl: task.business.logoUrl ?? undefined,
      title: task.title,
      address: task.address ?? '—',
      date: dateStr,
      timeRange: timeRangeStr,
      assignedTeamMemberName: assignedName,
      instructions: task.instructions,
    })
  }

  await createUserNotification({
    userId: actingUser.id,
    type: 'TASK_RESCHEDULED',
    title: `Task rescheduled - ${task.title}`,
    message: `${dateStr} · ${timeRangeStr}`,
    metadata: {
      taskId: task.id,
      clientName: task.client?.name ?? null,
    },
  })

  const ownerEmail = actingUser.email?.trim()
  if (ownerEmail) {
    await sendUserOperationEmail({
      to: ownerEmail,
      userName: actingUser.name,
      actionTitle: 'Task schedule updated',
      actionMessage: `"${task.title}" was rescheduled. The client was emailed if an email is on file.`,
    })
  }
}

/**
 * After drag-and-drop reschedule: email the client (when applicable) and notify the acting business user.
 * Failures are logged only; reschedule already succeeded.
 */
export async function notifyAfterScheduleReschedule(
  businessId: string,
  itemType: ScheduleItemType,
  itemId: string,
  actingUser: ScheduleRescheduleActingUser
): Promise<void> {
  try {
    if (itemType === 'workorder') {
      await notifyWorkOrderRescheduleSideEffects(businessId, itemId, actingUser)
    } else {
      await notifyTaskRescheduleSideEffects(businessId, itemId, actingUser)
    }
  } catch (err) {
    console.error('[schedule] Reschedule notification/email failed:', err)
  }
}

type QuickCreateWoForNotify = Prisma.WorkOrderGetPayload<{
  include: {
    client: { select: { name: true; email: true; phone: true } }
    primaryAssignee: { include: { user: { select: { name: true; email: true } } } }
    business: { include: { settings: { select: { replyToEmail: true } } } }
    lineItems: true
  }
}>

type QuickCreateTaskForNotify = Prisma.TaskGetPayload<{
  include: {
    client: { select: { name: true; email: true; phone: true } }
    assignedTo: { include: { user: { select: { name: true; email: true } } } }
    business: { include: { settings: { select: { replyToEmail: true } } } }
  }
}>

function sendQuickCreateWorkOrderAssigneeEmail(wo: QuickCreateWoForNotify): void {
  const assigneeEmail = wo.primaryAssignee?.user?.email?.trim()
  if (!assigneeEmail || !wo.primaryAssignee?.user || !wo.business) {
    return
  }
  const companyReplyTo = wo.business.settings?.replyToEmail?.trim() || wo.business.email
  const dateStr = formatScheduleEmailDate(wo.scheduledAt)
  const timeRangeStr = wo.isAnyTime
    ? 'Anytime'
    : formatScheduleTimeRange(wo.startTime, wo.endTime, wo.scheduledAt)
  const lineItemsSummary = wo.lineItems
    .map(
      li =>
        `${li.name} x ${li.quantity} @ ${Number(li.price)} = ${Number(li.quantity) * Number(li.price)}`
    )
    .join('\n')
  const totalStr = wo.total != null ? `$${Number(wo.total).toFixed(2)}` : undefined
  sendWorkOrderAssignedToTeamMemberEmail({
    to: assigneeEmail,
    assigneeName: wo.primaryAssignee.user.name ?? 'there',
    businessName: wo.business.name,
    companyReplyTo,
    companyLogoUrl: wo.business.logoUrl ?? undefined,
    workOrderNumber: wo.workOrderNumber ?? `#${wo.id}`,
    title: wo.title,
    clientName: wo.client.name,
    clientPhone: wo.client.phone,
    address: wo.address ?? '',
    date: dateStr,
    timeRange: timeRangeStr,
    lineItemsSummary,
    instructions: wo.instructions,
    total: totalStr,
  })
}

function sendQuickCreateTaskClientEmail(task: QuickCreateTaskForNotify): void {
  const clientEmail = task.client?.email?.trim()
  if (!clientEmail || !task.client || !task.business) {
    return
  }
  const replyTo = task.business.settings?.replyToEmail?.trim() || task.business.email
  const dateStr = formatScheduleEmailDate(task.scheduledAt)
  const timeRangeStr = task.isAnyTime
    ? 'Anytime'
    : formatScheduleTimeRange(task.startTime, task.endTime, task.scheduledAt)
  const addressDisplay = task.address ?? '—'
  const assignedName = task.assignedTo?.user?.name ?? 'Our team'
  sendTaskCreatedEmail({
    to: clientEmail,
    clientName: task.client.name,
    businessName: task.business.name,
    companyReplyTo: replyTo,
    companyLogoUrl: task.business.logoUrl ?? undefined,
    title: task.title,
    address: addressDisplay,
    date: dateStr,
    timeRange: timeRangeStr,
    assignedTeamMemberName: assignedName,
    instructions: task.instructions ?? undefined,
  })
}

function sendQuickCreateTaskAssigneeEmail(task: QuickCreateTaskForNotify): void {
  const assigneeEmail = task.assignedTo?.user?.email?.trim()
  if (!assigneeEmail || !task.assignedTo?.user || !task.business) {
    return
  }
  const companyReplyTo = task.business.settings?.replyToEmail?.trim() || task.business.email
  if (!companyReplyTo) {
    return
  }
  const dateStr = formatScheduleEmailDate(task.scheduledAt)
  const timeRangeStr = task.isAnyTime
    ? 'Anytime'
    : formatScheduleTimeRange(task.startTime, task.endTime, task.scheduledAt)
  const addressDisplay = task.address ?? '—'
  const clientLabel = task.client?.name ?? 'No client'
  const clientPhone = task.client?.phone ?? null
  sendTaskAssignedToTeamMemberEmail({
    to: assigneeEmail,
    assigneeName: task.assignedTo.user.name ?? 'there',
    businessName: task.business.name,
    companyReplyTo,
    companyLogoUrl: task.business.logoUrl ?? undefined,
    title: task.title,
    clientName: clientLabel,
    clientPhone,
    address: addressDisplay,
    date: dateStr,
    timeRange: timeRangeStr,
    instructions: task.instructions,
  })
}

function sendQuickCreateWorkOrderClientEmail(wo: {
  id: string
  title: string
  address: string
  instructions: string | null
  scheduledAt: Date | null
  startTime: string | null
  endTime: string | null
  isAnyTime: boolean
  workOrderNumber: string | null
  total: unknown
  tax: unknown
  client: { name: string; email: string | null; phone: string }
  primaryAssignee: { user: { name: string | null } } | null
  business: {
    name: string
    email: string
    logoUrl: string | null
    settings: { replyToEmail: string | null } | null
  }
  lineItems: Array<{ name: string; quantity: number; price: unknown }>
}): void {
  const clientEmail = wo.client.email?.trim()
  if (!clientEmail) {
    return
  }
  const companyReplyTo = wo.business.settings?.replyToEmail?.trim() || wo.business.email
  const assignedName = wo.primaryAssignee?.user?.name ?? 'Our team'
  const dateStr = formatScheduleEmailDate(wo.scheduledAt)
  const timeRangeStr = wo.isAnyTime
    ? 'Anytime'
    : formatScheduleTimeRange(wo.startTime, wo.endTime, wo.scheduledAt)
  const lineItemsSummary = wo.lineItems
    .map(
      li =>
        `${li.name} x ${li.quantity} @ ${Number(li.price)} = ${Number(li.quantity) * Number(li.price)}`
    )
    .join('\n')
  const totalStr = wo.total != null ? `$${Number(wo.total).toFixed(2)}` : undefined
  const taxStr = `$${Number(wo.tax ?? 0).toFixed(2)}`
  sendWorkOrderCreatedEmail({
    to: clientEmail,
    clientName: wo.client.name,
    businessName: wo.business.name,
    companyReplyTo,
    companyLogoUrl: wo.business.logoUrl ?? undefined,
    workOrderNumber: wo.workOrderNumber ?? `#${wo.id}`,
    title: wo.title,
    address: wo.address ?? '',
    date: dateStr,
    timeRange: timeRangeStr,
    assignedTeamMemberName: assignedName,
    lineItemsSummary,
    tax: taxStr,
    instructions: wo.instructions,
    total: totalStr,
  })
}

async function notifyQuickCreateWorkOrderSideEffects(
  businessId: string,
  workOrderId: string,
  actingUser: ScheduleRescheduleActingUser
): Promise<void> {
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    include: {
      client: { select: { name: true, email: true, phone: true } },
      primaryAssignee: { include: { user: { select: { name: true, email: true } } } },
      business: { include: { settings: { select: { replyToEmail: true } } } },
      lineItems: true,
    },
  })
  if (!wo) {
    return
  }

  try {
    sendQuickCreateWorkOrderClientEmail(wo)
  } catch (e) {
    console.error('[SCHEDULE] Failed to send work order created client email:', e)
  }

  try {
    sendQuickCreateWorkOrderAssigneeEmail(wo)
  } catch (e) {
    console.error('[SCHEDULE] Failed to send work order assignee email:', e)
  }

  await createUserNotification({
    userId: actingUser.id,
    type: 'WORKORDER_CREATED',
    title: `You created a work order - ${wo.title}`,
    message: `${wo.workOrderNumber ?? 'Work order'} - ${wo.client.name}`,
    metadata: {
      workOrderId: wo.id,
      workOrderNumber: wo.workOrderNumber,
      clientName: wo.client.name,
    },
  })

  const ownerEmail = actingUser.email?.trim()
  if (ownerEmail) {
    await sendUserOperationEmail({
      to: ownerEmail,
      userName: actingUser.name,
      actionTitle: 'Work order created successfully',
      actionMessage: `Your work order "${wo.title}" was created successfully.`,
    })
  }
}

async function notifyQuickCreateTaskSideEffects(
  businessId: string,
  taskId: string,
  actingUser: ScheduleRescheduleActingUser
): Promise<void> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, businessId },
    include: {
      client: { select: { name: true, email: true, phone: true } },
      assignedTo: { include: { user: { select: { name: true, email: true } } } },
      business: { include: { settings: { select: { replyToEmail: true } } } },
    },
  })
  if (!task) {
    return
  }

  try {
    sendQuickCreateTaskClientEmail(task)
  } catch (e) {
    console.error('[SCHEDULE] Failed to send task created client email:', e)
  }

  try {
    sendQuickCreateTaskAssigneeEmail(task)
  } catch (e) {
    console.error('[SCHEDULE] Failed to send task assignee email:', e)
  }

  await createUserNotification({
    userId: actingUser.id,
    type: 'TASK_CREATED',
    title: `You created a task - ${task.title}`,
    message: task.client?.name ?? 'No client',
    metadata: {
      taskId: task.id,
      clientName: task.client?.name ?? null,
    },
  })

  const ownerEmail = actingUser.email?.trim()
  if (ownerEmail) {
    await sendUserOperationEmail({
      to: ownerEmail,
      userName: actingUser.name,
      actionTitle: 'Task created successfully',
      actionMessage: `Your task "${task.title}" was created successfully.`,
    })
  }
}

/** Client email (if client has email), assignee email (if member has user email), in-app notification + ack for the acting user. */
export async function notifyAfterQuickCreateWorkOrder(
  businessId: string,
  workOrderId: string,
  actingUser: ScheduleRescheduleActingUser
): Promise<void> {
  try {
    await notifyQuickCreateWorkOrderSideEffects(businessId, workOrderId, actingUser)
  } catch (err) {
    console.error('[schedule] Quick create work order notification/email failed:', err)
  }
}

/** Client email (if applicable), assignee email (if member has user email), in-app notification + ack for the acting user. */
export async function notifyAfterQuickCreateTask(
  businessId: string,
  taskId: string,
  actingUser: ScheduleRescheduleActingUser
): Promise<void> {
  try {
    await notifyQuickCreateTaskSideEffects(businessId, taskId, actingUser)
  } catch (err) {
    console.error('[schedule] Quick create task notification/email failed:', err)
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
