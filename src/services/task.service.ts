/**
 * Task Management – standalone tasks or linked to a work order.
 * CRUD + status transitions: SCHEDULED → IN_PROGRESS → COMPLETED.
 */

import type { Prisma, TaskStatus } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'
import { sendTaskCreatedEmail } from '~/services/email-helpers'

// ─── Errors ──────────────────────────────────────────────────────────────────

export class TaskNotFoundError extends Error {
  constructor() {
    super('TASK_NOT_FOUND')
  }
}

export class ClientNotFoundError extends Error {
  constructor() {
    super('CLIENT_NOT_FOUND')
  }
}

export class WorkOrderNotFoundError extends Error {
  constructor() {
    super('WORK_ORDER_NOT_FOUND')
  }
}

export class MemberNotFoundError extends Error {
  constructor() {
    super('MEMBER_NOT_FOUND')
  }
}

export class TaskAlreadyCompletedError extends Error {
  constructor() {
    super('TASK_ALREADY_COMPLETED')
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TaskListFilters {
  search?: string
  taskStatus?: TaskStatus
  page?: number
  limit?: number
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'scheduledAt'
  order?: 'asc' | 'desc'
}

export interface CreateTaskInput {
  title: string
  clientId: string
  address?: string | null
  instructions?: string | null
  assignedToId?: string | null
  assignedToIds?: string[]
  workOrderId?: string | null
  scheduledAt?: Date | null
  startTime?: string | null
  endTime?: string | null
  isAnyTime?: boolean
}

export interface UpdateTaskInput {
  title?: string
  clientId?: string | null
  address?: string | null
  instructions?: string | null
  assignedToId?: string | null
  assignedToIds?: string[]
  workOrderId?: string | null
  scheduledAt?: Date | null
  startTime?: string | null
  endTime?: string | null
  isAnyTime?: boolean
}

// ─── Guard helpers ───────────────────────────────────────────────────────────

async function ensureBusinessExists(businessId: string): Promise<void> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  })
  if (!b) {
    throw new BusinessNotFoundError()
  }
}

async function ensureTaskExists(taskId: string, businessId: string): Promise<void> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, businessId },
    select: { id: true },
  })
  if (!task) {
    throw new TaskNotFoundError()
  }
}

async function ensureClientExists(clientId: string, businessId: string): Promise<void> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId },
    select: { id: true },
  })
  if (!client) {
    throw new ClientNotFoundError()
  }
}

async function ensureWorkOrderExists(workOrderId: string, businessId: string): Promise<void> {
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, businessId },
    select: { id: true },
  })
  if (!wo) {
    throw new WorkOrderNotFoundError()
  }
}

async function ensureMemberExists(memberId: string, businessId: string): Promise<void> {
  const member = await prisma.member.findFirst({
    where: { id: memberId, businessId },
    select: { id: true },
  })
  if (!member) {
    throw new MemberNotFoundError()
  }
}

// ─── Shared FK validation ────────────────────────────────────────────────────

interface RelationInput {
  clientId?: string | null
  workOrderId?: string | null
  assignedToId?: string | null
  assignedToIds?: string[]
}

function normalizeAssigneeIds(input: {
  assignedToId?: string | null
  assignedToIds?: string[]
}): string[] {
  const ids = [...(input.assignedToIds ?? [])]
  if (input.assignedToId) {
    ids.unshift(input.assignedToId)
  }
  return Array.from(new Set(ids.map(id => id.trim()).filter(Boolean)))
}

async function getMembersByIdsInOrder(businessId: string, memberIds: string[]) {
  if (memberIds.length === 0) {
    return []
  }
  const members = await prisma.member.findMany({
    where: {
      businessId,
      id: { in: memberIds },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  })
  const byId = new Map(members.map(member => [member.id, member]))
  return memberIds.map(id => byId.get(id)).filter((member): member is (typeof members)[number] => !!member)
}

async function validateTaskRelations(input: RelationInput, businessId: string): Promise<void> {
  const assigneeIds = normalizeAssigneeIds({
    assignedToId: input.assignedToId,
    assignedToIds: input.assignedToIds,
  })
  const assigneeCountPromise =
    assigneeIds.length > 0
      ? prisma.member.count({ where: { businessId, id: { in: assigneeIds } } })
      : Promise.resolve(0)
  const [, , , assigneeCount] = await Promise.all([
    input.clientId ? ensureClientExists(input.clientId, businessId) : null,
    input.workOrderId ? ensureWorkOrderExists(input.workOrderId, businessId) : null,
    input.assignedToId ? ensureMemberExists(input.assignedToId, businessId) : null,
    assigneeCountPromise,
  ])
  if (assigneeIds.length > 0 && assigneeCount !== assigneeIds.length) {
    throw new MemberNotFoundError()
  }
}

function mapTaskForApi<T extends { assignedToId?: string | null }>(task: T) {
  const assignedMember =
    'assignedTo' in task ? ((task as T & { assignedTo?: unknown }).assignedTo ?? null) : null
  const assignedToIds = assignedMember ? [assignedMember] : []
  const { assignedTo: _assignedTo, ...rest } = task as T & { assignedTo?: unknown }
  return {
    ...rest,
    assignedToIds,
  }
}

// ─── DB fetch ────────────────────────────────────────────────────────────────

async function getTaskById(businessId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, businessId },
    include: {
      client: {
        select: { id: true, name: true, email: true, phone: true, address: true },
      },
      assignedTo: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      workOrder: {
        select: { id: true, workOrderNumber: true, title: true },
      },
    },
  })
  if (!task) {
    throw new TaskNotFoundError()
  }
  return mapTaskForApi(task)
}

// ─── Email helpers ───────────────────────────────────────────────────────────

function formatTaskDateString(scheduledAt: Date | null): string {
  if (!scheduledAt) {
    return 'To be confirmed'
  }
  return scheduledAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatTaskTimeRange(
  isAnyTime: boolean,
  startTime: string | null,
  endTime: string | null
): string {
  if (isAnyTime) {
    return 'Anytime'
  }
  if (startTime && endTime) {
    return `${startTime} - ${endTime}`
  }
  return startTime ?? endTime ?? 'To be confirmed'
}

async function sendTaskCreatedEmailIfApplicable(taskId: string, businessId: string): Promise<void> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, businessId },
    include: {
      client: { select: { name: true, email: true } },
      assignedTo: { include: { user: { select: { name: true } } } },
      business: { include: { settings: { select: { replyToEmail: true } } } },
    },
  })

  if (!task?.client?.email) {
    return
  }
  if (!task.business) {
    return
  }

  const companyReplyTo = task.business.settings?.replyToEmail?.trim() || task.business.email

  sendTaskCreatedEmail({
    to: task.client.email,
    clientName: task.client.name,
    businessName: task.business.name,
    companyReplyTo,
    companyLogoUrl: task.business.logoUrl ?? undefined,
    title: task.title,
    address: task.address ?? '—',
    date: formatTaskDateString(task.scheduledAt),
    timeRange: formatTaskTimeRange(task.isAnyTime, task.startTime, task.endTime),
    assignedTeamMemberName: task.assignedTo?.user?.name ?? 'Our team',
    instructions: task.instructions ?? undefined,
  })
}

// ─── Query builder ────────────────────────────────────────────────────────────

function buildTaskWhereInput(businessId: string, filters: TaskListFilters): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { businessId }
  if (filters.taskStatus) {
    where.taskStatus = filters.taskStatus
  }

  const term = filters.search?.trim()
  if (term) {
    where.OR = [
      { title: { contains: term, mode: 'insensitive' } },
      { address: { contains: term, mode: 'insensitive' } },
      { instructions: { contains: term, mode: 'insensitive' } },
      { client: { name: { contains: term, mode: 'insensitive' } } },
    ]
  }
  return where
}

// ─── Update data builders (split to keep each under complexity limit) ─────────

// Handles scalar fields only (title, address, instructions, scheduledAt, startTime, endTime, isAnyTime)
function buildScalarUpdateFields(input: UpdateTaskInput): Prisma.TaskUpdateInput {
  const data: Prisma.TaskUpdateInput = {}
  if (input.title != null) {
    data.title = input.title
  }
  if (input.address !== undefined) {
    data.address = input.address ?? null
  }
  if (input.instructions !== undefined) {
    data.instructions = input.instructions ?? null
  }
  if (input.scheduledAt !== undefined) {
    data.scheduledAt = input.scheduledAt ?? null
  }
  if (input.startTime !== undefined) {
    data.startTime = input.startTime ?? null
  }
  if (input.endTime !== undefined) {
    data.endTime = input.endTime ?? null
  }
  if (input.isAnyTime !== undefined) {
    data.isAnyTime = input.isAnyTime
  }
  return data
}

// Handles relation fields only (clientId, workOrderId, assignedToId)
function buildRelationUpdateFields(input: UpdateTaskInput): Prisma.TaskUpdateInput {
  const data: Prisma.TaskUpdateInput = {}
  if (input.clientId !== undefined) {
    data.client = input.clientId ? { connect: { id: input.clientId } } : { disconnect: true }
  }
  if (input.workOrderId !== undefined) {
    data.workOrder = input.workOrderId
      ? { connect: { id: input.workOrderId } }
      : { disconnect: true }
  }
  if (input.assignedToId !== undefined) {
    data.assignedTo = input.assignedToId
      ? { connect: { id: input.assignedToId } }
      : { disconnect: true }
  }
  return data
}

// Merges scalar + relation into one update payload
function buildTaskUpdateData(input: UpdateTaskInput): Prisma.TaskUpdateInput {
  return {
    ...buildScalarUpdateFields(input),
    ...buildRelationUpdateFields(input),
  }
}

// ─── Task status fetch helper ────────────────────────────────────────────────

async function fetchTaskForStatusUpdate(taskId: string, businessId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, businessId },
    select: { id: true, taskStatus: true },
  })
  if (!task) {
    throw new TaskNotFoundError()
  }
  if (task.taskStatus === 'COMPLETED') {
    throw new TaskAlreadyCompletedError()
  }
  return task
}

// ─── Service Functions ────────────────────────────────────────────────────────

export async function listTasks(businessId: string, filters: TaskListFilters = {}) {
  await ensureBusinessExists(businessId)

  const { page = 1, limit = 10, sortBy = 'scheduledAt', order = 'asc' } = filters
  const skip = (page - 1) * limit
  const where = buildTaskWhereInput(businessId, filters)

  const [items, total] = await Promise.all([
    prisma.task.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: order },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        assignedTo: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    }),
    prisma.task.count({ where }),
  ])

  return {
    data: items.map(item => mapTaskForApi(item)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

export async function getTask(businessId: string, taskId: string) {
  await ensureBusinessExists(businessId)
  return getTaskById(businessId, taskId)
}

export async function createTask(businessId: string, input: CreateTaskInput) {
  await ensureBusinessExists(businessId)
  await validateTaskRelations(input, businessId)
  const normalizedAssignedToIds = normalizeAssigneeIds({
    assignedToId: input.assignedToId,
    assignedToIds: input.assignedToIds,
  })

  const task = await prisma.task.create({
    data: {
      businessId,
      title: input.title,
      address: input.address ?? null,
      instructions: input.instructions ?? null,
      clientId: input.clientId ?? null,
      workOrderId: input.workOrderId ?? null,
      assignedToId: normalizedAssignedToIds[0] ?? null,
      scheduledAt: input.scheduledAt ?? null,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      isAnyTime: input.isAnyTime ?? false,
      taskStatus: 'SCHEDULED',
    },
  })

  try {
    await sendTaskCreatedEmailIfApplicable(task.id, businessId)
  } catch (e) {
    console.error('[TASK] Failed to send task created email:', e)
  }

  const created = await getTaskById(businessId, task.id)
  const assignedMembers = await getMembersByIdsInOrder(businessId, normalizedAssignedToIds)
  return { ...created, assignedToIds: assignedMembers }
}

export async function updateTask(businessId: string, taskId: string, input: UpdateTaskInput) {
  await ensureBusinessExists(businessId)
  await ensureTaskExists(taskId, businessId)
  await validateTaskRelations(
    {
      clientId: input.clientId || null,
      workOrderId: input.workOrderId || null,
      assignedToId: input.assignedToId || null,
      assignedToIds: input.assignedToIds,
    },
    businessId
  )

  const normalizedAssignedToIds = normalizeAssigneeIds({
    assignedToId: input.assignedToId,
    assignedToIds: input.assignedToIds,
  })

  await prisma.task.update({
    where: { id: taskId },
    data: {
      ...buildTaskUpdateData(input),
      ...(input.assignedToIds !== undefined && {
        assignedTo:
          normalizedAssignedToIds[0] != null
            ? { connect: { id: normalizedAssignedToIds[0] } }
            : { disconnect: true },
      }),
    },
  })

  const updated = await getTaskById(businessId, taskId)
  if (input.assignedToIds !== undefined) {
    const assignedMembers = await getMembersByIdsInOrder(businessId, normalizedAssignedToIds)
    return { ...updated, assignedToIds: assignedMembers }
  }
  return updated
}

export async function deleteTask(businessId: string, taskId: string) {
  await ensureBusinessExists(businessId)
  await ensureTaskExists(taskId, businessId)
  await prisma.task.delete({ where: { id: taskId } })
}

export async function startTask(businessId: string, taskId: string) {
  await ensureBusinessExists(businessId)
  await fetchTaskForStatusUpdate(taskId, businessId)

  await prisma.task.update({
    where: { id: taskId },
    data: { taskStatus: 'IN_PROGRESS', startedAt: new Date() },
  })

  return getTaskById(businessId, taskId)
}

export async function completeTask(businessId: string, taskId: string) {
  await ensureBusinessExists(businessId)
  await fetchTaskForStatusUpdate(taskId, businessId)

  await prisma.task.update({
    where: { id: taskId },
    data: {
      taskStatus: 'COMPLETED',
      isCompleted: true,
      completedAt: new Date(),
    },
  })

  return getTaskById(businessId, taskId)
}

export async function getTaskOverview(businessId: string) {
  await ensureBusinessExists(businessId)

  const counts = await prisma.task.groupBy({
    by: ['taskStatus'],
    where: { businessId },
    _count: { id: true },
  })

  return counts.map(c => ({ status: c.taskStatus, count: c._count.id }))
}
