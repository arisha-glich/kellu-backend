import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent } from 'stoker/openapi/helpers'
import { zodResponseSchema } from '~/lib/zod-helper'

const AdminReportQuerySchema = z.object({
  preset: z
    .enum(['LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_3_MONTHS', 'LAST_12_MONTHS', 'ALL_TIME'])
    .optional()
    .openapi({ param: { name: 'preset', in: 'query' } }),
  from: z
    .string()
    .optional()
    .openapi({ param: { name: 'from', in: 'query' } }),
  to: z
    .string()
    .optional()
    .openapi({ param: { name: 'to', in: 'query' } }),
  businessId: z
    .string()
    .optional()
    .openapi({ param: { name: 'businessId', in: 'query' } }),
  reportType: z
    .enum([
      'BUSINESS_SUMMARY',
      'REVENUE_REPORT',
      'WORKORDERS_REPORT',
      'INVOICES_REPORT',
      'JOBS_REPORT',
    ])
    .optional()
    .openapi({ param: { name: 'reportType', in: 'query' } }),
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
      totalWorkorders: z.number().int(),
      revenue: z.number(),
      invoicePaid: z.number(),
      invoiceOverdue: z.number(),
    })
  ),
})

const AdminWorkordersReportSchema = z.object({
  range: ReportRangeSchema,
  totalWorkorders: z.number().int(),
  byStatus: z.record(z.string(), z.number().int()),
})

const AdminInvoicesReportSchema = z.object({
  range: ReportRangeSchema,
  invoicePaid: z.number(),
  invoiceOverdue: z.number(),
  invoiceCount: z.number().int(),
})

const AdminRevenueReportSchema = z.object({
  range: ReportRangeSchema,
  totalRevenue: z.number(),
  paidRevenue: z.number(),
  outstandingRevenue: z.number(),
  invoiceCount: z.number().int(),
})

const AdminSummaryReportSchema = z.object({
  businesses: AdminBusinessesReportSchema.optional(),
  workorders: AdminWorkordersReportSchema.optional(),
  revenue: AdminRevenueReportSchema.optional(),
  invoices: AdminInvoicesReportSchema.optional(),
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
    summary: 'Admin: reports summary for businesses, workorders, revenue, and invoices',
    request: { query: AdminReportQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(AdminSummaryReportSchema), 'OK'),
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

  workorders: createRoute({
    method: 'get',
    tags: ['Admin Reports'],
    path: '/workorders',
    summary: 'Admin: workorders report',
    request: { query: AdminReportQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(AdminWorkordersReportSchema), 'OK'),
      ...commonErrorResponses,
    },
  }),

  invoices: createRoute({
    method: 'get',
    tags: ['Admin Reports'],
    path: '/invoices',
    summary: 'Admin: invoices report',
    request: { query: AdminReportQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(AdminInvoicesReportSchema), 'OK'),
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
}
