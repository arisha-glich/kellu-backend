import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const AdminExpenseCategoryEnum = z.enum(['GENERAL', 'WORK_ORDER', 'ALL'])
const AdminExpenseStatusEnum = z.enum(['UNBILLED', 'INVOICED', 'ALL'])

const AdminExpenseQuerySchema = z.object({
  businessId: z
    .string()
    .optional()
    .openapi({ param: { name: 'businessId', in: 'query' } }),
  category: AdminExpenseCategoryEnum.optional().openapi({
    param: { name: 'category', in: 'query' },
  }),
  status: AdminExpenseStatusEnum.optional().openapi({
    param: { name: 'status', in: 'query' },
  }),
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

const AdminExpenseOverviewSchema = z.object({
  thisYearExpenses: z.number().int(),
  totalExpenses: z.number(),
  averageExpense: z.number(),
})

const AdminExpenseItemSchema = z.object({
  id: z.string(),
  business: z.object({
    id: z.string(),
    name: z.string(),
  }),
  category: z.enum(['GENERAL', 'WORK_ORDER']),
  description: z.string(),
  amount: z.number(),
  status: z.enum(['UNBILLED', 'INVOICED']),
  date: z.coerce.date(),
})

const PaginationSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
})

const AdminExpenseDashboardSchema = z.object({
  overview: AdminExpenseOverviewSchema,
  expenses: z.array(AdminExpenseItemSchema),
  pagination: PaginationSchema,
  businessOptions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    })
  ),
})

export const ADMIN_EXPENSE_ROUTES = {
  listDashboard: createRoute({
    method: 'get',
    tags: ['Admin Expenses'],
    path: '/',
    summary: 'Admin: expenses dashboard list + overview for admin portal UI',
    request: { query: AdminExpenseQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(AdminExpenseDashboardSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Business not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}
