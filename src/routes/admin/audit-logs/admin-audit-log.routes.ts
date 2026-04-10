import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const AuditActionFilterSchema = z.enum(['ALL', 'LOGIN_LOGOUT', 'CREATED', 'UPDATED', 'DELETED'])
const AuditModuleFilterSchema = z.enum([
  'all',
  'authentication',
  'business',
  'quote',
  'task',
  'schedule',
  'expense',
  'priceList',
  'client',
  'workorder',
  'invoice',
  'user',
  'settings',
  'reports',
  'roles',
  'notifications',
  'insights',
])

const AuditLogQuerySchema = z.object({
  action: AuditActionFilterSchema.optional().openapi({ param: { name: 'action', in: 'query' } }),
  module: AuditModuleFilterSchema.optional().openapi({ param: { name: 'module', in: 'query' } }),
  businessId: z
    .string()
    .optional()
    .openapi({ param: { name: 'businessId', in: 'query' } }),
  search: z
    .string()
    .optional()
    .openapi({ param: { name: 'search', in: 'query' } }),
  page: z
    .string()
    .optional()
    .openapi({ param: { name: 'page', in: 'query' } }),
  limit: z
    .string()
    .optional()
    .openapi({ param: { name: 'limit', in: 'query' } }),
})

const AuditLogItemSchema = z.object({
  id: z.string(),
  timestamp: z.coerce.date(),
  action: z.string(),
  module: z.string(),
  targetBusiness: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
  performedBy: z
    .object({
      id: z.string(),
      email: z.string(),
      name: z.string().nullable(),
    })
    .nullable(),
  entityId: z.string().nullable(),
  oldValues: z.unknown().nullable(),
  newValues: z.unknown().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
})

const AuditLogListResponseSchema = z.object({
  data: z.array(AuditLogItemSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
})

const AuditLogFiltersResponseSchema = z.object({
  actions: z.array(z.enum(['LOGIN_LOGOUT', 'CREATED', 'UPDATED', 'DELETED'])),
  modules: z.array(z.string()),
})

export const ADMIN_AUDIT_LOG_ROUTES = {
  list: createRoute({
    method: 'get',
    tags: ['Admin Audit Logs'],
    path: '/',
    summary: 'Admin: list audit logs',
    request: { query: AuditLogQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(AuditLogListResponseSchema), 'OK'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
  filters: createRoute({
    method: 'get',
    tags: ['Admin Audit Logs'],
    path: '/filters',
    summary: 'Admin: list audit log filter options',
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(AuditLogFiltersResponseSchema), 'OK'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}
