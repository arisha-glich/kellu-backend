/**
 * Schedule API handlers (§4 Scheduling & Calendar).
 * Business resolved from authenticated user — same pattern as existing handlers.
 */

import * as HttpStatusCodes from 'stoker/http-status-codes'
import { createAuditLog } from '~/services/audit-log.service'
import { BusinessNotFoundError, getBusinessIdByUserId } from '~/services/business.service'
import { hasPermission } from '~/services/permission.service'
import {
  getDailySchedule,
  getScheduleItems,
  getTeamMembersForSchedule,
  notifyAfterQuickCreateTask,
  notifyAfterQuickCreateWorkOrder,
  notifyAfterScheduleReschedule,
  quickCreateTask,
  quickCreateWorkOrder,
  rescheduleItem,
} from '~/services/schedule.service'
import type { HandlerMapFromRoutes } from '~/types'
import type { SCHEDULE_ROUTES } from './schedule.routes'

function getClientMeta(c: { req: { header: (k: string) => string | undefined } }) {
  const forwarded = c.req.header('x-forwarded-for')
  const ipAddress = forwarded?.split(',')[0]?.trim() || null
  const userAgent = c.req.header('user-agent') ?? null
  return { ipAddress, userAgent }
}

export const SCHEDULE_HANDLER: HandlerMapFromRoutes<typeof SCHEDULE_ROUTES> = {
  // ─────────────────────────────────────────────
  // GET /schedule  — Week/Month range view
  // ─────────────────────────────────────────────
  list: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }

    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }

      if (!(await hasPermission(user.id, businessId, 'workorders', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view the schedule' },
          HttpStatusCodes.FORBIDDEN
        )
      }

      const query = c.req.valid('query')
      const result = await getScheduleItems(businessId, {
        start: query.start,
        end: query.end,
        type: query.type,
        teamMemberId: query.teamMemberId ?? undefined,
        includeUnscheduled: query.includeUnscheduled,
      })

      return c.json(
        { message: 'Schedule retrieved successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching schedule:', error)
      return c.json(
        { message: 'Failed to retrieve schedule' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  // ─────────────────────────────────────────────
  // GET /schedule/day  — Day view with technician lanes
  // ─────────────────────────────────────────────
  day: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }

    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }

      if (!(await hasPermission(user.id, businessId, 'workorders', 'read'))) {
        return c.json(
          { message: 'You do not have permission to view the schedule' },
          HttpStatusCodes.FORBIDDEN
        )
      }

      const query = c.req.valid('query')
      const date = new Date(query.date)

      const result = await getDailySchedule(businessId, date, {
        type: query.type,
        teamMemberId: query.teamMemberId ?? undefined,
      })

      return c.json(
        { message: 'Daily schedule retrieved successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching daily schedule:', error)
      return c.json(
        { message: 'Failed to retrieve daily schedule' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  // ─────────────────────────────────────────────
  // GET /schedule/team-members  — Lane headers
  // ─────────────────────────────────────────────
  teamMembers: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }

    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }

      const members = await getTeamMembersForSchedule(businessId)

      return c.json(
        { message: 'Team members retrieved successfully', success: true, data: members },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error fetching team members:', error)
      return c.json(
        { message: 'Failed to retrieve team members' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  // ─────────────────────────────────────────────
  // PATCH /schedule/:type/:id/reschedule  — Drag & drop
  // ─────────────────────────────────────────────
  reschedule: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }

    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }

      // Business owner can reschedule anything
      // Technician can only reschedule their own items (permission check via service)
      if (!(await hasPermission(user.id, businessId, 'workorders', 'update'))) {
        return c.json(
          { message: 'You do not have permission to reschedule' },
          HttpStatusCodes.FORBIDDEN
        )
      }

      const { type, id } = c.req.valid('param')
      const body = c.req.valid('json')

      const { item: result, shouldNotifyReschedule } = await rescheduleItem(
        businessId,
        id,
        type,
        body
      )
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'SCHEDULE_UPDATED',
        module: 'schedule',
        entityId: id,
        newValues: { type, id },
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })

      if (shouldNotifyReschedule) {
        await notifyAfterScheduleReschedule(businessId, type, id, {
          id: user.id,
          email: user.email,
          name: user.name,
        })
      }

      return c.json(
        { message: 'Item rescheduled successfully', success: true, data: result },
        HttpStatusCodes.OK
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return c.json({ message: error.message }, HttpStatusCodes.NOT_FOUND)
        }
        if (error.message.includes('Cannot reschedule')) {
          return c.json({ message: error.message }, HttpStatusCodes.BAD_REQUEST)
        }
      }
      console.error('Error rescheduling item:', error)
      return c.json({ message: 'Failed to reschedule item' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },

  // ─────────────────────────────────────────────
  // POST /schedule/workorders  — Quick create from calendar
  // ─────────────────────────────────────────────
  quickCreateWorkOrder: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }

    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }

      if (!(await hasPermission(user.id, businessId, 'workorders', 'create'))) {
        return c.json(
          { message: 'You do not have permission to create work orders' },
          HttpStatusCodes.FORBIDDEN
        )
      }

      const body = c.req.valid('json')

      const result = await quickCreateWorkOrder({
        businessId,
        clientId: body.clientId,
        title: body.title,
        address: body.address,
        instructions: body.instructions ?? null,
        assignedToId: body.assignedToId ?? null,
        scheduledAt: body.scheduledAt ?? null,
        startTime: body.startTime ?? null,
        endTime: body.endTime ?? null,
        isScheduleLater: body.isScheduleLater,
        isAnyTime: body.isAnyTime,
      })
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'SCHEDULE_CREATED',
        module: 'schedule',
        entityId: result.id,
        newValues: { type: 'workorder', id: result.id, title: result.title },
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })

      await notifyAfterQuickCreateWorkOrder(businessId, result.id, {
        id: user.id,
        email: user.email,
        name: user.name,
      })

      return c.json(
        { message: 'Work order created successfully', success: true, data: result },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      if (error instanceof Error && error.message.includes('Client not found')) {
        return c.json({ message: 'Client not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error quick-creating work order:', error)
      return c.json(
        { message: 'Failed to create work order' },
        HttpStatusCodes.INTERNAL_SERVER_ERROR
      )
    }
  },

  // ─────────────────────────────────────────────
  // POST /schedule/tasks  — Quick create task from calendar
  // ─────────────────────────────────────────────
  quickCreateTask: async c => {
    const user = c.get('user')
    if (!user) {
      return c.json({ message: 'Unauthorized' }, HttpStatusCodes.UNAUTHORIZED)
    }

    try {
      const businessId = await getBusinessIdByUserId(user.id)
      if (!businessId) {
        return c.json({ message: 'Business not found for this user' }, HttpStatusCodes.NOT_FOUND)
      }

      if (!(await hasPermission(user.id, businessId, 'tasks', 'create'))) {
        return c.json(
          { message: 'You do not have permission to create tasks' },
          HttpStatusCodes.FORBIDDEN
        )
      }

      const body = c.req.valid('json')

      const result = await quickCreateTask({
        businessId,
        clientId: body.clientId ?? null,
        title: body.title,
        address: body.address ?? null,
        instructions: body.instructions ?? null,
        assignedToId: body.assignedToId ?? null,
        scheduledAt: body.scheduledAt ?? null,
        startTime: body.startTime ?? null,
        endTime: body.endTime ?? null,
        isAnyTime: body.isAnyTime,
        workOrderId: body.workOrderId ?? null,
      })
      const { ipAddress, userAgent } = getClientMeta(c)
      await createAuditLog({
        action: 'SCHEDULE_CREATED',
        module: 'schedule',
        entityId: result.id,
        newValues: { type: 'task', id: result.id, title: result.title },
        userId: user.id,
        businessId,
        ipAddress,
        userAgent,
      })

      await notifyAfterQuickCreateTask(businessId, result.id, {
        id: user.id,
        email: user.email,
        name: user.name,
      })

      return c.json(
        { message: 'Task created successfully', success: true, data: result },
        HttpStatusCodes.CREATED
      )
    } catch (error) {
      if (error instanceof BusinessNotFoundError) {
        return c.json({ message: 'Business not found' }, HttpStatusCodes.NOT_FOUND)
      }
      console.error('Error quick-creating task:', error)
      return c.json({ message: 'Failed to create task' }, HttpStatusCodes.INTERNAL_SERVER_ERROR)
    }
  },
}
