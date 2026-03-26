import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent } from 'stoker/openapi/helpers'
import { TAGS } from '~/config/tags'
import { zodResponseSchema } from '~/lib/zod-helper'
import { BusinessParamsSchema } from '~/routes/business/business.routes'

/** Kellu Insights: overview filter (Figma — Month to date, Last month, custom range). */
export const InsightsDateQuerySchema = z
  .object({
    preset: z
      .enum(['MTD', 'LAST_MONTH', 'LAST_30_DAYS', 'YTD', 'CUSTOM'])
      .optional()
      .openapi({
        param: { name: 'preset', in: 'query' },
        description: 'Preset window when `from` and `to` are omitted (defaults to MTD)',
      }),
    from: z
      .string()
      .optional()
      .openapi({
        param: { name: 'from', in: 'query' },
        description: 'Range start (YYYY-MM-DD); pair with `to` for a custom range',
      }),
    to: z
      .string()
      .optional()
      .openapi({
        param: { name: 'to', in: 'query' },
        description: 'Range end (YYYY-MM-DD)',
      }),
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

export const InsightsOverviewDataSchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  convertedQuotes: z.number().int(),
  jobs: z.number().int(),
  invoicedValue: z.number(),
})

export const InsightsRevenueDataSchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  priorYearRange: z.object({ from: z.string(), to: z.string() }),
  totalCurrentRange: z.number(),
  totalPriorYearSameRange: z.number(),
  byMonth: z.array(
    z.object({
      year: z.number().int(),
      month: z.number().int(),
      label: z.string(),
      currentYearTotal: z.number(),
      priorYearTotal: z.number(),
    })
  ),
})

export const InsightsLeadConversionDataSchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  byQuoteStatus: z.record(z.string(), z.number().int()),
  quotesSentInPeriod: z.number().int(),
  quotesConvertedInPeriod: z.number().int(),
})

export const InsightsJobsDataSchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  byJobStatus: z.record(z.string(), z.number().int()),
  total: z.number().int(),
})

export const InsightsInvoicesDataSchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  byStatus: z.array(
    z.object({
      status: z.string(),
      count: z.number().int(),
      total: z.number(),
    })
  ),
  invoicedValue: z.number(),
  count: z.number().int(),
})

const insightErrorResponses = {
  [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Not found'),
  [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
  [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
  [HttpStatusCodes.BAD_REQUEST]: jsonContent(zodResponseSchema(), 'Bad request'),
  [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
} as const

export const INSIGHTS_ROUTES = {
  getOverview: createRoute({
    method: 'get',
    tags: ['Insights'],
    path: '/{id}/insights/overview',
    summary: 'Insights overview KPIs (converted quotes, jobs, invoiced value)',
    request: { params: BusinessParamsSchema, query: InsightsDateQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(InsightsOverviewDataSchema), 'OK'),
      ...insightErrorResponses,
    },
  }),

  getRevenue: createRoute({
    method: 'get',
    tags: ['Insights'],
    path: '/{id}/insights/revenue',
    summary: 'Revenue YoY (totals + monthly buckets for chart)',
    request: { params: BusinessParamsSchema, query: InsightsDateQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(InsightsRevenueDataSchema), 'OK'),
      ...insightErrorResponses,
    },
  }),

  getLeadConversion: createRoute({
    method: 'get',
    tags: ['Insights'],
    path: '/{id}/insights/lead-conversion',
    summary: 'Quote / lead funnel counts for Insights tab',
    request: { params: BusinessParamsSchema, query: InsightsDateQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(InsightsLeadConversionDataSchema), 'OK'),
      ...insightErrorResponses,
    },
  }),

  getJobs: createRoute({
    method: 'get',
    tags: ['Insights'],
    path: '/{id}/insights/jobs',
    summary: 'Jobs breakdown by status for Insights tab',
    request: { params: BusinessParamsSchema, query: InsightsDateQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(InsightsJobsDataSchema), 'OK'),
      ...insightErrorResponses,
    },
  }),

  getInvoices: createRoute({
    method: 'get',
    tags: ['Insights'],
    path: '/{id}/insights/invoices',
    summary: 'Invoice aggregates by status for Insights tab',
    request: { params: BusinessParamsSchema, query: InsightsDateQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(InsightsInvoicesDataSchema), 'OK'),
      ...insightErrorResponses,
    },
  }),
}

export type InsightsRoutes = typeof INSIGHTS_ROUTES
