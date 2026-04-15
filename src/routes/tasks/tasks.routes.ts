/**
 * Task API routes – CRUD + status actions (start, complete).
 */

import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const TaskStatusEnum = z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED','UNSCHEDULED'])


export const CreateTaskBodySchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    clientId: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    instructions: z.string().optional().nullable(),
    assignedToId: z.string().optional().nullable(),
    assignedToIds: z.array(z.string().min(1)).optional(),
    workOrderId: z.string().optional().nullable(),
    scheduledAt: z.coerce.date().optional().nullable(),
    startTime: z.string().optional().nullable(),
    endTime: z.string().optional().nullable(),
    isAnyTime: z.boolean().optional(),
  })
  .openapi({ description: 'Create task (standalone or linked to work order)' })

export const UpdateTaskBodySchema = z
  .object({
    title: z.string().min(1).optional(),
    clientId: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    instructions: z.string().optional().nullable(),
    assignedToId: z.string().optional().nullable(),
    assignedToIds: z.array(z.string().min(1)).optional(),
    workOrderId: z.string().optional().nullable(),
    scheduledAt: z.coerce.date().optional().nullable(),
    startTime: z.string().optional().nullable(),
    endTime: z.string().optional().nullable(),
    isAnyTime: z.boolean().optional(),
  })
  .openapi({ description: 'Update task fields' })

export const TaskListQuerySchema = z.object({
  search: z
    .string()
    .optional()
    .openapi({
      param: { name: 'search', in: 'query' },
      description: 'Search by title, address, instructions, or client name',
    }),
  taskStatus: TaskStatusEnum.optional().openapi({
    param: { name: 'taskStatus', in: 'query' },
  }),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'title', 'scheduledAt'])
    .optional()
    .openapi({ param: { name: 'sortBy', in: 'query' } }),
  order: z
    .enum(['asc', 'desc'])
    .optional()
    .openapi({ param: { name: 'order', in: 'query' } }),
  page: z
    .string()
    .optional()
    .openapi({ param: { name: 'page', in: 'query' } }),
  limit: z
    .string()
    .optional()
    .openapi({ param: { name: 'limit', in: 'query' } }),
})

const ClientRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string(),
  address: z.string().nullable(),
})

const AssignedToSchema = z.object({
  id: z.string(),
  user: z.object({ name: z.string().nullable(), email: z.string() }),
})

const TaskAssigneeMemberSchema = z.object({
  id: z.string(),
  calendarColor: z.string().nullable(),
  user: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string(),
  }),
})

const TaskAssigneeRowSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  memberId: z.string(),
  createdAt: z.coerce.date(),
  member: TaskAssigneeMemberSchema,
})

const TaskDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  address: z.string().nullable(),
  instructions: z.string().nullable(),
  isAnyTime: z.boolean(),
  taskStatus: TaskStatusEnum,
  isCompleted: z.boolean(),
  completedAt: z.coerce.date().nullable(),
  startedAt: z.coerce.date().nullable(),
  scheduledAt: z.coerce.date().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  client: ClientRefSchema.nullable(),
  assignedTo: AssignedToSchema.nullable(),
  assignees: z.array(TaskAssigneeRowSchema),
  workOrder: z
    .object({
      id: z.string(),
      workOrderNumber: z.string().nullable(),
      title: z.string(),
    })
    .nullable(),
})

const TaskListItemSchema = TaskDetailSchema.pick({
  id: true,
  title: true,
  address: true,
  taskStatus: true,
  scheduledAt: true,
  createdAt: true,
  client: true,
  assignedTo: true,
})

const PaginationSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
})

const TaskListResponseSchema = z.object({
  data: z.array(TaskListItemSchema),
  pagination: PaginationSchema,
})

const TaskOverviewItemSchema = z.object({
  status: TaskStatusEnum,
  count: z.number().int(),
})

export const TaskParamsSchema = z.object({
  taskId: z.string().openapi({
    param: { name: 'taskId', in: 'path' },
    description: 'Task ID',
  }),
})

export const TASK_ROUTES = {
  list: createRoute({
    method: 'get',
    tags: ['Tasks'],
    path: '/',
    summary: 'List tasks (search, filter by status, sort, paginate)',
    request: { query: TaskListQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(TaskListResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  overview: createRoute({
    method: 'get',
    tags: ['Tasks'],
    path: '/overview',
    summary: 'Get task status counts for overview block',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(z.array(TaskOverviewItemSchema)), 'OK'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getById: createRoute({
    method: 'get',
    tags: ['Tasks'],
    path: '/{taskId}',
    summary: 'Get task by ID',
    request: { params: TaskParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(TaskDetailSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Task not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  create: createRoute({
    method: 'post',
    tags: ['Tasks'],
    path: '/',
    summary: 'Create new task',
    request: { body: jsonContentRequired(CreateTaskBodySchema, 'Create task payload') },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(zodResponseSchema(TaskDetailSchema), 'Created'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business or client not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Validation error'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  update: createRoute({
    method: 'patch',
    tags: ['Tasks'],
    path: '/{taskId}',
    summary: 'Update task fields (status changed only via start/complete)',
    request: {
      params: TaskParamsSchema,
      body: jsonContentRequired(UpdateTaskBodySchema, 'Update task payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(TaskDetailSchema), 'Updated'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Task not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  delete: createRoute({
    method: 'delete',
    tags: ['Tasks'],
    path: '/{taskId}',
    summary: 'Delete task',
    request: { params: TaskParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(z.object({ message: z.string(), success: z.literal(true) })),
        'Deleted'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Task not found'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  start: createRoute({
    method: 'post',
    tags: ['Tasks'],
    path: '/{taskId}/start',
    summary: 'Start task (set status to IN_PROGRESS)',
    request: { params: TaskParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(TaskDetailSchema), 'Started'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Task not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Task already completed'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  complete: createRoute({
    method: 'post',
    tags: ['Tasks'],
    path: '/{taskId}/complete',
    summary: 'Complete task (set status to COMPLETED)',
    request: { params: TaskParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(TaskDetailSchema), 'Completed'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Task not found'),
      [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Task already completed'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type TaskRoutes = typeof TASK_ROUTES
