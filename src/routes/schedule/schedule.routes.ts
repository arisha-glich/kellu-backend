/**
 * Schedule / Calendar API routes (§4 Scheduling & Calendar).
 * GET schedule items for a date range with filters (type, team member).
 */

import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const ScheduleTypeEnum = z.enum(['all', 'workorder', 'task'])

export const ScheduleListQuerySchema = z.object({
  start: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .transform(s => new Date(s))
    .openapi({ param: { name: 'start', in: 'query' }, description: 'Start of range (ISO date or date-time)' }),
  end: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .transform(s => new Date(s))
    .openapi({ param: { name: 'end', in: 'query' }, description: 'End of range (ISO date or date-time)' }),
  type: ScheduleTypeEnum.optional()
    .default('all')
    .openapi({ param: { name: 'type', in: 'query' }, description: 'Filter by type: workorder, task, or all' }),
  teamMemberId: z
    .string()
    .optional()
    .nullable()
    .openapi({ param: { name: 'teamMemberId', in: 'query' }, description: 'Filter by assigned team member ID' }),
  includeUnscheduled: z
    .string()
    .optional()
    .transform(s => (s === undefined || s === '' ? true : s !== 'false' && s !== '0'))
    .openapi({
      param: { name: 'includeUnscheduled', in: 'query' },
      description: 'Include items with no date (default true)',
    }),
})

const ScheduleItemSchema = z.object({
  id: z.string(),
  type: z.enum(['workorder', 'task']),
  title: z.string(),
  clientName: z.string().nullable(),
  address: z.string(),
  scheduledAt: z.coerce.date().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  isAnyTime: z.boolean(),
  isScheduleLater: z.boolean(),
  assignedToId: z.string().nullable(),
  assignedToName: z.string().nullable(),
  status: z.string(),
  completedAt: z.coerce.date().nullable(),
  workOrderNumber: z.string().nullable(),
  workOrderId: z.string().nullable(),
})

export const ScheduleListResponseSchema = z.object({
  scheduled: z.array(ScheduleItemSchema),
  unscheduled: z.array(ScheduleItemSchema),
})

export const SCHEDULE_ROUTES = {
  list: createRoute({
    method: 'get',
    tags: ['Schedule'],
    path: '/',
    summary: 'Get schedule items for date range (Day/Week/Month)',
    description:
      'Returns work orders and tasks in the given range. Optional filters: type (workorder|task|all), teamMemberId. Unscheduled items (no date) are returned when includeUnscheduled is true.',
    request: { query: ScheduleListQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(ScheduleListResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type ScheduleRoutes = typeof SCHEDULE_ROUTES
