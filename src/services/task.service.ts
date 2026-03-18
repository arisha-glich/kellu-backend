/**
 * Task Management – standalone tasks or linked to a work order.
 * CRUD + status transitions: SCHEDULED → IN_PROGRESS → COMPLETED.
 */

import type { Prisma } from '~/generated/prisma'
import type { TaskStatus } from '~/generated/prisma'
import prisma from '~/lib/prisma'
import { BusinessNotFoundError } from '~/services/business.service'
import { sendTaskCreatedEmail } from '~/services/email-helpers'

export class TaskNotFoundError extends Error {
  constructor() {
    super('TASK_NOT_FOUND')
  }
}

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
  clientId?: string | null
  address?: string | null
  instructions?: string | null
  assignedToId?: string | null
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
  workOrderId?: string | null
  scheduledAt?: Date | null
  startTime?: string | null
  endTime?: string | null
  isAnyTime?: boolean
}

async function ensureBusinessExists(businessId: string): Promise<void> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  })
  if (!b) throw new BusinessNotFoundError()
}

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
  if (!task) throw new TaskNotFoundError()
  return task
}

/**
 * List tasks with search, status filter, sort, pagination.
 */
export async function listTasks(businessId: string, filters: TaskListFilters = {}) {
  await ensureBusinessExists(businessId)

  const {
    search,
    taskStatus,
    page = 1,
    limit = 10,
    sortBy = 'scheduledAt',
    order = 'asc',
  } = filters
  const skip = (page - 1) * limit

  const where: Prisma.TaskWhereInput = { businessId }

  if (taskStatus) where.taskStatus = taskStatus

  if (search?.trim()) {
    where.OR = [
      { title: { contains: search.trim(), mode: 'insensitive' } },
      { address: { contains: search.trim(), mode: 'insensitive' } },
      { instructions: { contains: search.trim(), mode: 'insensitive' } },
      { client: { name: { contains: search.trim(), mode: 'insensitive' } } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.task.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: order },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        assignedTo: {
          select: { id: true, user: { select: { name: true, email: true } } },
        },
      },
    }),
    prisma.task.count({ where }),
  ])

  return {
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

/**
 * Get a single task by ID.
 */
export async function getTask(businessId: string, taskId: string) {
  await ensureBusinessExists(businessId)
  return getTaskById(businessId, taskId)
}

/**
 * Create a new task (standalone or linked to a work order).
 */
export async function createTask(businessId: string, input: CreateTaskInput) {
  await ensureBusinessExists(businessId)

  if (input.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: input.clientId, businessId },
      select: { id: true },
    })
    if (!client) throw new Error('CLIENT_NOT_FOUND')
  }

  if (input.workOrderId) {
    const wo = await prisma.workOrder.findFirst({
      where: { id: input.workOrderId, businessId },
      select: { id: true },
    })
    if (!wo) throw new Error('WORK_ORDER_NOT_FOUND')
  }

  if (input.assignedToId) {
    const member = await prisma.member.findFirst({
      where: { id: input.assignedToId, businessId },
      select: { id: true },
    })
    if (!member) throw new Error('MEMBER_NOT_FOUND')
  }

  const task = await prisma.task.create({
    data: {
      businessId,
      title: input.title,
      address: input.address ?? null,
      instructions: input.instructions ?? null,
      clientId: input.clientId ?? null,
      workOrderId: input.workOrderId ?? null,
      assignedToId: input.assignedToId ?? null,
      scheduledAt: input.scheduledAt ?? null,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      isAnyTime: input.isAnyTime ?? false,
      taskStatus: 'SCHEDULED',
    },
  })

  const result = await getTaskById(businessId, task.id)
  const clientEmail = result.client?.email?.trim()
  if (clientEmail && result.client) {
    try {
      const taskForEmail = await prisma.task.findFirst({
        where: { id: task.id, businessId },
        include: {
          client: { select: { name: true, email: true } },
          assignedTo: { include: { user: { select: { name: true } } } },
          business: { include: { settings: { select: { replyToEmail: true } } } },
        },
      })
      if (taskForEmail?.client?.email && taskForEmail.business) {
        const companyReplyTo =
          (taskForEmail.business.settings?.replyToEmail?.trim() || taskForEmail.business.email)
        const assignedName = taskForEmail.assignedTo?.user?.name ?? 'Our team'
        const dateStr = taskForEmail.scheduledAt
          ? taskForEmail.scheduledAt.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          : 'To be confirmed'
        const timeRangeStr =
          taskForEmail.isAnyTime
            ? 'Anytime'
            : taskForEmail.startTime && taskForEmail.endTime
              ? `${taskForEmail.startTime} - ${taskForEmail.endTime}`
              : taskForEmail.startTime ?? taskForEmail.endTime ?? 'To be confirmed'
        sendTaskCreatedEmail({
          to: taskForEmail.client.email,
          clientName: taskForEmail.client.name,
          businessName: taskForEmail.business.name,
          companyReplyTo,
          companyLogoUrl: taskForEmail.business.logoUrl ?? undefined,
          title: taskForEmail.title,
          address: taskForEmail.address ?? '—',
          date: dateStr,
          timeRange: timeRangeStr,
          assignedTeamMemberName: assignedName,
          instructions: taskForEmail.instructions ?? undefined,
        })
      }
    } catch (e) {
      console.error('[TASK] Failed to send task created email:', e)
    }
  }

  return result
}

/**
 * Update task fields. Status is only changed via start/complete actions.
 */
export async function updateTask(
  businessId: string,
  taskId: string,
  input: UpdateTaskInput
) {
  await ensureBusinessExists(businessId)

  const existing = await prisma.task.findFirst({
    where: { id: taskId, businessId },
    select: { id: true },
  })
  if (!existing) throw new TaskNotFoundError()

  if (input.clientId != null) {
    if (input.clientId) {
      const client = await prisma.client.findFirst({
        where: { id: input.clientId, businessId },
        select: { id: true },
      })
      if (!client) throw new Error('CLIENT_NOT_FOUND')
    }
  }

  if (input.workOrderId != null && input.workOrderId) {
    const wo = await prisma.workOrder.findFirst({
      where: { id: input.workOrderId, businessId },
      select: { id: true },
    })
    if (!wo) throw new Error('WORK_ORDER_NOT_FOUND')
  }

  if (input.assignedToId != null && input.assignedToId) {
    const member = await prisma.member.findFirst({
      where: { id: input.assignedToId, businessId },
      select: { id: true },
    })
    if (!member) throw new Error('MEMBER_NOT_FOUND')
  }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(input.title != null && { title: input.title }),
      ...(input.address !== undefined && { address: input.address ?? null }),
      ...(input.instructions !== undefined && { instructions: input.instructions ?? null }),
      ...(input.clientId !== undefined && { clientId: input.clientId ?? null }),
      ...(input.workOrderId !== undefined && { workOrderId: input.workOrderId ?? null }),
      ...(input.assignedToId !== undefined && { assignedToId: input.assignedToId ?? null }),
      ...(input.scheduledAt !== undefined && { scheduledAt: input.scheduledAt ?? null }),
      ...(input.startTime !== undefined && { startTime: input.startTime ?? null }),
      ...(input.endTime !== undefined && { endTime: input.endTime ?? null }),
      ...(input.isAnyTime !== undefined && { isAnyTime: input.isAnyTime }),
    },
  })

  return getTaskById(businessId, taskId)
}

/**
 * Delete a task.
 */
export async function deleteTask(businessId: string, taskId: string) {
  await ensureBusinessExists(businessId)

  const existing = await prisma.task.findFirst({
    where: { id: taskId, businessId },
    select: { id: true },
  })
  if (!existing) throw new TaskNotFoundError()

  await prisma.task.delete({ where: { id: taskId } })
}

/**
 * Start task — set status to IN_PROGRESS and record startedAt.
 */
export async function startTask(businessId: string, taskId: string) {
  await ensureBusinessExists(businessId)

  const task = await prisma.task.findFirst({
    where: { id: taskId, businessId },
    select: { id: true, taskStatus: true },
  })
  if (!task) throw new TaskNotFoundError()
  if (task.taskStatus === 'COMPLETED') {
    throw new Error('TASK_ALREADY_COMPLETED')
  }

  const now = new Date()
  await prisma.task.update({
    where: { id: taskId },
    data: {
      taskStatus: 'IN_PROGRESS',
      startedAt: now,
    },
  })

  return getTaskById(businessId, taskId)
}

/**
 * Complete task — set status to COMPLETED, isCompleted true, completedAt now.
 */
export async function completeTask(businessId: string, taskId: string) {
  await ensureBusinessExists(businessId)

  const task = await prisma.task.findFirst({
    where: { id: taskId, businessId },
    select: { id: true, taskStatus: true },
  })
  if (!task) throw new TaskNotFoundError()
  if (task.taskStatus === 'COMPLETED') {
    throw new Error('TASK_ALREADY_COMPLETED')
  }

  const now = new Date()
  await prisma.task.update({
    where: { id: taskId },
    data: {
      taskStatus: 'COMPLETED',
      isCompleted: true,
      completedAt: now,
    },
  })

  return getTaskById(businessId, taskId)
}

/**
 * Task status overview counts (for dashboard block).
 */
export async function getTaskOverview(businessId: string) {
  await ensureBusinessExists(businessId)

  const counts = await prisma.task.groupBy({
    by: ['taskStatus'],
    where: { businessId },
    _count: { id: true },
  })

  return counts.map((c) => ({ status: c.taskStatus, count: c._count.id }))
}
