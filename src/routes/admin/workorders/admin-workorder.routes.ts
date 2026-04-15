import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const AdminWorkorderStatusEnum = z.enum(['ACTIVE', 'PENDING', 'COMPLETED', 'CANCELED', 'ALL'])

const AdminWorkorderQuerySchema = z.object({
  businessId: z
    .string()
    .optional()
    .openapi({ param: { name: 'businessId', in: 'query' } }),
  search: z.string().optional().openapi({ param: { name: 'search', in: 'query' } }),
  status: AdminWorkorderStatusEnum.optional().openapi({
    param: { name: 'status', in: 'query' },
  }),
  page: z.string().optional().openapi({ param: { name: 'page', in: 'query' } }),
  limit: z.string().optional().openapi({ param: { name: 'limit', in: 'query' } }),
})

const AdminWorkorderOverviewSchema = z.object({
  activeWorkorders: z.object({
    active: z.number().int(),
    pending: z.number().int(),
  }),
  completedWorkorders: z.number().int(),
  canceledWorkorders: z.number().int(),
  totalValue: z.number(),
})

const AdminWorkorderListItemSchema = z.object({
  id: z.string(),
  workOrderId: z.string(),
  business: z.object({
    id: z.string(),
    name: z.string(),
  }),
  client: z.object({
    id: z.string(),
    name: z.string(),
  }),
  title: z.string(),
  status: z.enum(['ACTIVE', 'PENDING', 'COMPLETED', 'CANCELED']),
  amount: z.number(),
  createdAt: z.coerce.date(),
})

const PaginationSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
})

const AdminWorkorderDashboardSchema = z.object({
  overview: AdminWorkorderOverviewSchema,
  workorders: z.array(AdminWorkorderListItemSchema),
  pagination: PaginationSchema,
  businessOptions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    })
  ),
})

export const ADMIN_WORKORDER_ROUTES = {
  listDashboard: createRoute({
    method: 'get',
    tags: ['Admin Workorders'],
    path: '/',
    summary: 'Admin: workorders dashboard list + overview for admin portal UI',
    request: { query: AdminWorkorderQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(AdminWorkorderDashboardSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}
