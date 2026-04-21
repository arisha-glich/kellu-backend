/**
 * Task API handlers.
 */

import * as HttpStatusCodes from 'stoker/http-status-codes'
import type { TASK_ROUTES } from '~/routes/tasks/tasks.routes'
import { createAuditLog } from '~/services/audit-log.service'
import { BusinessNotFoundError, getBusinessIdByUserId } from '~/services/business.service'
import { createUserNotification } from '~/services/notifications.service'
import { hasPermission } from '~/services/permission.service'
import {
  completeTask,
  convertTaskToWorkOrder,
  createTask,
  deleteTask,
  getTask,
  getTaskOverview,
  listTasks,
  startTask,
  TaskNotFoundError,
  updateTask,
} from '~/services/task.service'
import { ClientNotFoundError, WorkOrderAssigneeNotFoundError } from '~/services/workorder.service'
import type { HandlerMapFromRoutes } from '~/types'

function resolveTaskAssigneeIds(body: { assignedToIds?: string[] | null }): string[] | undefined {
  const incoming = [...(body.assignedToIds ?? [])]
  if (incoming.length === 0) {
    return undefined
  }
  const deduped = Array.from(new Set(incoming.map(id => id.trim()).filter(Boolean)))
  return deduped.length > 0 ? deduped : undefined
}

function getClientMeta(c: { req: { header: (k: string) => string | undefined } }) {
  const forwarded = c.req.header('x-forwarded-for')
  const ipAddress = forwarded?.split(',')[0]?.trim() || null
  const userAgent = c.req.header('user-agent') ?? null
  return { ipAddress, userAgent }
}

async function createTaskOperationNotification(input: {
  userId: string
  type: 'TASK_CREATED' | 'TASK_UPDATED' | 'TASK_DELETED'
  title: string
  message?: string | null
  metadata: Record<string, unknown>
}) {
  try {
    await createUserNotification(input)
  } catch (error) {
    console.error('Task notification failed:', error)
  }
}

export const TASK_HANDLER: HandlerMapFromRoutes<typeof TASK_ROUTES> = {
  list: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'tasks', 'read'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const query = c.req.valid('query')
      const page = query.page ? Number.parseInt(query.page, 10) : 1
      const limit = query.limit ? Number.parseInt(query.limit, 10) : 10

      const result = await listTasks(businessId, {
        search: query.search,
        taskStatus: query.taskStatus,
        sortBy: query.sortBy,
        order: query.order,
        page,
        limit,
      })
      return c.json(
        { message: 'Tasks retrieved successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error listing tasks:', error)
      return c.json({ message: 'Failed to retrieve tasks' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  overview: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }

      const overview = await getTaskOverview(businessId)
      return c.json(
        { message: 'Overview retrieved successfully', success: true, data: overview },
        HttpStatusCodes.OK
      )
    } catch (error) {
      console.error('Error fetching task overview:', error)
      return c.json(
        { message: 'Failed to retrieve overview' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  getById: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'tasks', 'read'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const { taskId } = c.req.valid('param')
      const task = await getTask(businessId, taskId)
      return c.json(
        { message: 'Task retrieved successfully', success: true, data: task },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof TaskNotFoundError) {
        return c.json({ message: 'Task not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching task:', error)
      return c.json({ message: 'Failed to retrieve task' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  create: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'tasks', 'create'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const body = c.req.valid('json')
      const assignedToIds = resolveTaskAssigneeIds(body)
      const task = await createTask(businessId, {
        title: body.title,
        clientId: body.clientId,
        address: body.address ?? null,
        instructions: body.instructions ?? null,
        assignedToId: assignedToIds?.[0] ?? null,
        assignedToIds,
        workOrderId: body.workOrderId ?? null,
        scheduledAt: body.scheduledAt ?? null,
        startTime: body.startTime ?? null,
        endTime: body.endTime ?? null,
        isAnyTime: body.isAnyTime ?? false,
      })
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'TASK_CREATED',
        module: 'task',
        entityId: task.id,
        newValues: { id: task.id, title: task.title, status: task.taskStatus },
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })
      await createTaskOperationNotification({
        userId: user.id,
        type: 'TASK_CREATED',
        title: `You created a task - ${task.title}`,
        message: task.client?.name ?? null,
        metadata: {
          taskId: task.id,
          title: task.title,
          taskStatus: task.taskStatus,
          clientName: task.client?.name ?? null,
        },
      })
      return c.json(
        { message: 'Task created successfully', success: true, data: task },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'CLIENT_NOT_FOUND') {
        return c.json({ message: 'Client not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'WORK_ORDER_NOT_FOUND') {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'MEMBER_NOT_FOUND') {
        return c.json({ message: 'Assigned member not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error creating task:', error)
      return c.json({ message: 'Failed to create task' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  update: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'tasks', 'update'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const { taskId } = c.req.valid('param')
      const body = c.req.valid('json')
      const assignedToIds = resolveTaskAssigneeIds(body)
      const task = await updateTask(businessId, taskId, {
        ...(body.title != null && { title: body.title }),
        ...(body.clientId !== undefined && { clientId: body.clientId }),
        ...(body.address !== undefined && { address: body.address ?? null }),
        ...(body.instructions !== undefined && { instructions: body.instructions ?? null }),
        ...(body.assignedToIds !== undefined
          ? { assignedToId: assignedToIds?.[0] ?? null, assignedToIds: assignedToIds ?? [] }
          : {}),
        ...(body.workOrderId !== undefined && { workOrderId: body.workOrderId ?? null }),
        ...(body.scheduledAt !== undefined && { scheduledAt: body.scheduledAt ?? null }),
        ...(body.startTime !== undefined && { startTime: body.startTime ?? null }),
        ...(body.endTime !== undefined && { endTime: body.endTime ?? null }),
        ...(body.isAnyTime !== undefined && { isAnyTime: body.isAnyTime }),
      })
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'TASK_UPDATED',
        module: 'task',
        entityId: task.id,
        newValues: { id: task.id, title: task.title, status: task.taskStatus },
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })
      await createTaskOperationNotification({
        userId: user.id,
        type: 'TASK_UPDATED',
        title: `You updated a task - ${task.title}`,
        message: task.client?.name ?? null,
        metadata: {
          taskId: task.id,
          title: task.title,
          taskStatus: task.taskStatus,
          clientName: task.client?.name ?? null,
        },
      })
      return c.json(
        { message: 'Task updated successfully', success: true, data: task },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof TaskNotFoundError) {
        return c.json({ message: 'Task not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'CLIENT_NOT_FOUND') {
        return c.json({ message: 'Client not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'WORK_ORDER_NOT_FOUND') {
        return c.json({ message: 'Work order not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'MEMBER_NOT_FOUND') {
        return c.json({ message: 'Assigned member not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error updating task:', error)
      return c.json({ message: 'Failed to update task' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  delete: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'tasks', 'delete'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const { taskId } = c.req.valid('param')
      let taskTitleForNotification = 'Task'
      let taskClientNameForNotification: string | null = null
      try {
        const taskToDelete = await getTask(businessId, taskId)
        taskTitleForNotification = taskToDelete.title
        taskClientNameForNotification = taskToDelete.client?.name ?? null
      } catch {
        // Ignore metadata fetch errors and continue delete flow.
      }
      await deleteTask(businessId, taskId)
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'TASK_DELETED',
        module: 'task',
        entityId: taskId,
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })
      await createTaskOperationNotification({
        userId: user.id,
        type: 'TASK_DELETED',
        title: `You deleted a task - ${taskTitleForNotification}`,
        message: taskClientNameForNotification,
        metadata: {
          taskId,
          title: taskTitleForNotification,
          clientName: taskClientNameForNotification,
        },
      })
      return c.json(
        { message: 'Task deleted successfully', success: true as const },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof TaskNotFoundError) {
        return c.json({ message: 'Task not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error deleting task:', error)
      return c.json({ message: 'Failed to delete task' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  start: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'tasks', 'update'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const { taskId } = c.req.valid('param')
      const task = await startTask(businessId, taskId)
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'TASK_UPDATED',
        module: 'task',
        entityId: task.id,
        newValues: { id: task.id, status: task.taskStatus },
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Task started successfully', success: true, data: task },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof TaskNotFoundError) {
        return c.json({ message: 'Task not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'TASK_ALREADY_COMPLETED') {
        return c.json({ message: 'Task is already completed' }, HttpStatusCodes.BAD_REQUEST)
      }
      console.error('Error starting task:', error)
      return c.json({ message: 'Failed to start task' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  complete: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'tasks', 'update'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const { taskId } = c.req.valid('param')
      const task = await completeTask(businessId, taskId)
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'TASK_UPDATED',
        module: 'task',
        entityId: task.id,
        newValues: { id: task.id, status: task.taskStatus },
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })
      return c.json(
        { message: 'Task completed successfully', success: true, data: task },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof TaskNotFoundError) {
        return c.json({ message: 'Task not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message === 'TASK_ALREADY_COMPLETED') {
        return c.json({ message: 'Task is already completed' }, HttpStatusCodes.BAD_REQUEST)
      }
      console.error('Error completing task:', error)
      return c.json({ message: 'Failed to complete task' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  convertToWorkorder: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }
    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (!(await hasPermission(user.id, businessId, 'tasks', 'delete'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }
      if (!(await hasPermission(user.id, businessId, 'workorders', 'create'))) {
        return c.json({ message: 'Forbidden' }, HttpStatusCodes.FORBIDDEN)
      }

      const { taskId } = c.req.valid('param')
      const body = c.req.valid('json')
      const converted = await convertTaskToWorkOrder(businessId, taskId, {
        notes: body.notes ?? null,
        lineItems: body.lineItems,
      })
      return c.json(
        { message: 'Task converted to work order successfully', success: true, data: converted },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof TaskNotFoundError) {
        return c.json({ message: 'Task not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof ClientNotFoundError) {
        return c.json(
          { message: 'Task must have a client before conversion' },
          HttpStatusCodes.BAD_REQUEST
        )
      }
      if (error instanceof WorkOrderAssigneeNotFoundError) {
        return c.json(
          { message: 'One or more assigned team members were not found in this business' },
          HttpStatusCodes.NOT_FOUND
        )
      }
      console.error('Error converting task to work order:', error)
      return c.json(
        { message: 'Failed to convert task to work order' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },
}
