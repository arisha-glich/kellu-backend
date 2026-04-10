/**
 * Schedule / Calendar API routes (§4 Scheduling & Calendar).
 *
 * Endpoints:
 *   GET  /schedule              → week/month range view (existing)
 *   GET  /schedule/day          → day view with technician lanes
 *   GET  /schedule/team-members → list members for lane headers
 *   POST /schedule/workorders   → quick create work order from calendar
 *   POST /schedule/tasks        → quick create task from calendar
 *   PATCH /schedule/:type/:id/reschedule → drag & drop / time change
 */

import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const ScheduleTypeEnum = z.enum(['all', 'workorder', 'task'])
const ItemTypeEnum = z.enum(['workorder', 'task'])

// ─────────────────────────────────────────────
// SHARED SCHEMAS
// ─────────────────────────────────────────────

const ScheduleItemAssigneeSchema = z.object({
  memberId: z.string(),
  name: z.string().nullable(),
  calendarColor: z.string().nullable(),
})

export const ScheduleItemSchema = z.object({
  id: z.string(),
  type: ItemTypeEnum,
  title: z.string(),
  clientName: z.string().nullable(),
  clientId: z.string().nullable(),
  address: z.string(),
  scheduledAt: z.coerce.date().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  isAnyTime: z.boolean(),
  isScheduleLater: z.boolean(),
  assignedToId: z.string().nullable(),
  assignedToName: z.string().nullable(),
  assignedToColor: z.string().nullable(),
  assignees: z.array(ScheduleItemAssigneeSchema).optional(),
  status: z.string(),
  completedAt: z.coerce.date().nullable(),
  workOrderNumber: z.string().nullable(),
  workOrderId: z.string().nullable(),
  quoteStatus: z.string().nullable(),
  invoiceStatus: z.string().nullable(),
})

const TeamMemberLaneSchema = z.object({
  memberId: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  items: z.array(ScheduleItemSchema),
})

// ─────────────────────────────────────────────
// QUERY SCHEMAS
// ─────────────────────────────────────────────

export const ScheduleListQuerySchema = z.object({
  start: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .transform(s => new Date(s))
    .openapi({
      param: { name: 'start', in: 'query' },
      description: 'Start of range (ISO date or date-time)',
    }),
  end: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .transform(s => new Date(s))
    .openapi({
      param: { name: 'end', in: 'query' },
      description: 'End of range (ISO date or date-time)',
    }),
  type: ScheduleTypeEnum.optional()
    .default('all')
    .openapi({
      param: { name: 'type', in: 'query' },
      description: 'Filter: workorder | task | all',
    }),
  teamMemberId: z
    .string()
    .optional()
    .nullable()
    .openapi({
      param: { name: 'teamMemberId', in: 'query' },
      description: 'Filter by assigned team member ID',
    }),
  includeUnscheduled: z
    .string()
    .optional()
    .transform(s => (s === undefined || s === '' ? true : s !== 'false' && s !== '0'))
    .openapi({
      param: { name: 'includeUnscheduled', in: 'query' },
      description: 'Include items with no date (default true)',
    }),
})

export const DayQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .openapi({
      param: { name: 'date', in: 'query' },
      description: 'Day to view (YYYY-MM-DD)',
    }),
  type: ScheduleTypeEnum.optional()
    .default('all')
    .openapi({ param: { name: 'type', in: 'query' } }),
  teamMemberId: z
    .string()
    .optional()
    .nullable()
    .openapi({
      param: { name: 'teamMemberId', in: 'query' },
      description: 'Filter to a single team member lane',
    }),
})

// ─────────────────────────────────────────────
// BODY SCHEMAS
// ─────────────────────────────────────────────

export const RescheduleBodySchema = z.object({
  scheduledAt: z.coerce.date().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  isScheduleLater: z.boolean().optional(),
  isAnyTime: z.boolean().optional(),
})

export const QuickCreateWorkOrderBodySchema = z.object({
  clientId: z.string().min(1, 'Client is required'),
  title: z.string().min(1, 'Title is required'),
  address: z.string().min(1, 'Address is required'),
  instructions: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  isScheduleLater: z.boolean().optional().default(false),
  isAnyTime: z.boolean().optional().default(false),
  lineItems: z
    .array(
      z.object({
        name: z.string(),
        itemType: z.enum(['SERVICE', 'PRODUCT']).default('SERVICE'),
        description: z.string().nullable().optional(),
        quantity: z.number().int().min(1).default(1),
        price: z.number().min(0),
        cost: z.number().min(0).nullable().optional(),
      })
    )
    .optional()
    .default([]),
})

export const QuickCreateTaskBodySchema = z.object({
  title: z.string().min(1, 'Title is required'),
  clientId: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  isAnyTime: z.boolean().optional().default(false),
  workOrderId: z.string().nullable().optional(),
})

// ─────────────────────────────────────────────
// RESPONSE SCHEMAS
// ─────────────────────────────────────────────

export const ScheduleListResponseSchema = z.object({
  scheduled: z.array(ScheduleItemSchema),
  unscheduled: z.array(ScheduleItemSchema),
})

export const DailyScheduleResponseSchema = z.object({
  date: z.string(),
  unassigned: z.array(ScheduleItemSchema),
  anytime: z.array(ScheduleItemSchema),
  lanes: z.array(TeamMemberLaneSchema),
  unscheduled: z.array(ScheduleItemSchema),
})

export const TeamMemberSchema = z.object({
  memberId: z.string(),
  name: z.string(),
  color: z.string().nullable(),
})

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

export const SCHEDULE_ROUTES = {
  /**
   * GET /schedule
   * Week/Month view: scheduled + unscheduled items for a date range
   */
  list: createRoute({
    method: 'get',
    tags: ['Schedule'],
    path: '/',
    summary: 'Get schedule items for date range (Week/Month view)',
    description:
      'Returns work orders and tasks in the given range. ' +
      'Optional filters: type (workorder|task|all), teamMemberId. ' +
      'Unscheduled items (no date) returned when includeUnscheduled=true.',
    request: { query: ScheduleListQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(ScheduleListResponseSchema), 'OK'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  /**
   * GET /schedule/day
   * Day view: technician lanes + unassigned row + anytime column + unscheduled panel
   */
  day: createRoute({
    method: 'get',
    tags: ['Schedule'],
    path: '/day',
    summary: 'Get daily schedule with technician lanes (Day view)',
    description:
      'Returns items grouped into: technician lanes (assigned items), ' +
      'unassigned row (scheduled but no technician), ' +
      'anytime column (isAnyTime=true), ' +
      'and unscheduled panel (no date at all). ' +
      'Used for the side-by-side daily timeline.',
    request: { query: DayQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(DailyScheduleResponseSchema), 'OK'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  /**
   * GET /schedule/team-members
   * Returns active team members with their calendar color for lane headers
   */
  teamMembers: createRoute({
    method: 'get',
    tags: ['Schedule'],
    path: '/team-members',
    summary: 'Get team members for calendar lane headers',
    description: 'Returns active team members with calendar colors for day view lane rendering.',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(z.array(TeamMemberSchema)),
        'Team members list'
      ),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  /**
   * PATCH /schedule/:type/:id/reschedule
   * Drag & drop between technicians / time slots / extend time block
   */
  reschedule: createRoute({
    method: 'patch',
    tags: ['Schedule'],
    path: '/:type/:id/reschedule',
    summary: 'Reschedule or reassign an item (drag & drop)',
    description:
      'Updates scheduledAt, startTime, endTime, and/or assignedToId for a work order or task. ' +
      'Used for drag & drop between technician lanes and time slot changes.',
    request: {
      params: z.object({
        type: ItemTypeEnum,
        id: z.string(),
      }),
      body: {
        content: { 'application/json': { schema: RescheduleBodySchema } },
      },
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(ScheduleItemSchema), 'Rescheduled'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Invalid input or state'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Item not found'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  /**
   * POST /schedule/workorders
   * Quick create work order from calendar short form
   */
  quickCreateWorkOrder: createRoute({
    method: 'post',
    tags: ['Schedule'],
    path: '/workorders',
    summary: 'Quick create work order from calendar',
    description:
      'Creates a work order using the short calendar form (title, client, address, assign, schedule). ' +
      'Optional line items. Mirrors the Jobber quick-create flow.',
    request: {
      body: {
        content: { 'application/json': { schema: QuickCreateWorkOrderBodySchema } },
      },
    },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(ScheduleItemSchema), 'Created'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Validation error'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Client not found'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  /**
   * POST /schedule/tasks
   * Quick create standalone task from calendar short form
   */
  quickCreateTask: createRoute({
    method: 'post',
    tags: ['Schedule'],
    path: '/tasks',
    summary: 'Quick create task from calendar',
    description:
      'Creates a standalone task from the calendar short form. ' +
      'Tasks are not linked to any work order by default.',
    request: {
      body: {
        content: { 'application/json': { schema: QuickCreateTaskBodySchema } },
      },
    },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(ScheduleItemSchema), 'Created'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Client not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Validation error'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type ScheduleRoutes = typeof SCHEDULE_ROUTES
