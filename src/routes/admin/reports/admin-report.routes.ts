import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const AdminReportQuerySchema = z
  .object({
    preset: z
      .enum(['LAST_7_DAYS', 'LAST_30_DAYS', 'THIS_MONTH', 'THIS_YEAR', 'CUSTOM'])
      .optional()
      .openapi({ param: { name: 'preset', in: 'query' } }),
    from: z.string().optional().openapi({ param: { name: 'from', in: 'query' } }),
    to: z.string().optional().openapi({ param: { name: 'to', in: 'query' } }),
    businessId: z.string().optional().openapi({ param: { name: 'businessId', in: 'query' } }),
  })
  .superRefine((val, ctx) => {
    if (val.preset === 'CUSTOM' && (!val.from || !val.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'from and to are required when preset is CUSTOM',
        path: ['from'],
      })
    }
  })

const ReportRangeSchema = z.object({
  from: z.string(),
  to: z.string(),
})

const AdminBusinessesReportSchema = z.object({
  range: ReportRangeSchema,
  totals: z.object({
    totalBusinesses: z.number().int(),
    activeBusinesses: z.number().int(),
    inactiveBusinesses: z.number().int(),
    newBusinesses: z.number().int(),
  }),
  byBusiness: z.array(
    z.object({
      businessId: z.string(),
      businessName: z.string(),
      totalJobs: z.number().int(),
      revenue: z.number(),
      expenses: z.number(),
    })
  ),
})

const AdminJobsReportSchema = z.object({
  range: ReportRangeSchema,
  totalJobs: z.number().int(),
  byStatus: z.record(z.string(), z.number().int()),
})

const AdminRevenueReportSchema = z.object({
  range: ReportRangeSchema,
  totalRevenue: z.number(),
  paidRevenue: z.number(),
  outstandingRevenue: z.number(),
  invoiceCount: z.number().int(),
})

const AdminExpensesReportSchema = z.object({
  range: ReportRangeSchema,
  totalExpenses: z.number(),
  expenseCount: z.number().int(),
  avgExpense: z.number(),
})

const AdminUserActivityReportSchema = z.object({
  range: ReportRangeSchema,
  sessions: z.number().int(),
  activeUsers: z.number().int(),
  auditEvents: z.number().int(),
  topActions: z.array(
    z.object({
      action: z.string(),
      count: z.number().int(),
    })
  ),
})

const commonErrorResponses = {
  [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Bad request'),
  [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
  [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
  [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
} as const

export const ADMIN_REPORT_ROUTES = {
  summary: createRoute({
    method: 'get',
    tags: ['Admin Reports'],
    path: '/summary',
    summary: 'Admin: reports summary for businesses, jobs, revenue, expenses, and user activity',
    request: { query: AdminReportQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(
          z.object({
            businesses: AdminBusinessesReportSchema,
            jobs: AdminJobsReportSchema,
            revenue: AdminRevenueReportSchema,
            expenses: AdminExpensesReportSchema,
            userActivity: AdminUserActivityReportSchema,
          })
        ),
        'OK'
      ),
      ...commonErrorResponses,
    },
  }),

  businesses: createRoute({
    method: 'get',
    tags: ['Admin Reports'],
    path: '/businesses',
    summary: 'Admin: businesses report',
    request: { query: AdminReportQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(AdminBusinessesReportSchema), 'OK'),
      ...commonErrorResponses,
    },
  }),

  jobs: createRoute({
    method: 'get',
    tags: ['Admin Reports'],
    path: '/jobs',
    summary: 'Admin: jobs report',
    request: { query: AdminReportQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(AdminJobsReportSchema), 'OK'),
      ...commonErrorResponses,
    },
  }),

  revenue: createRoute({
    method: 'get',
    tags: ['Admin Reports'],
    path: '/revenue',
    summary: 'Admin: revenue report',
    request: { query: AdminReportQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(AdminRevenueReportSchema), 'OK'),
      ...commonErrorResponses,
    },
  }),

  expenses: createRoute({
    method: 'get',
    tags: ['Admin Reports'],
    path: '/expenses',
    summary: 'Admin: expenses report',
    request: { query: AdminReportQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(AdminExpensesReportSchema), 'OK'),
      ...commonErrorResponses,
    },
  }),

  userActivity: createRoute({
    method: 'get',
    tags: ['Admin Reports'],
    path: '/user-activity',
    summary: 'Admin: user activity report',
    request: { query: AdminReportQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(AdminUserActivityReportSchema), 'OK'),
      ...commonErrorResponses,
    },
  }),
}
