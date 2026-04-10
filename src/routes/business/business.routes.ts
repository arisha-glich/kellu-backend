import { createRoute, z } from '@hono/zod-openapi'
import * as HttpStatusCodes from 'stoker/http-status-codes'
import { jsonContent, jsonContentRequired } from 'stoker/openapi/helpers'
import { TAGS } from '~/config/tags'
import { isValidIanaTimeZoneId } from '~/lib/iana-timezone-from-country'
import { zodResponseSchema } from '~/lib/zod-helper'

/** Kelly Figma: Company Name, Business Email, Status, Total Jobs, Revenue, Users, Last Login */
export const BusinessSchema = z.object({
  id: z.string(),
  companyName: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  website: z.string().nullable(),
  status: z.string(),
  registered: z.coerce.date(),
  lastLogin: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  timeZone: z.string(),
  country: z.string().nullable(),
  userId: z.string(),
  owner: z.object({
    name: z.string().nullable(),
    email: z.string().email(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
  }),
  totalJobs: z.number().int(),
  revenue: z.number(),
  users: z.number().int(),
  contactInfo: z.object({
    email: z.string().email(),
    phone: z.string(),
    address: z.string().nullable(),
    website: z.string().nullable(),
  }),
})

export const CreateBusinessResponseSchema = z.object({
  id: z.string(),
  companyName: z.string(),
  email: z.string().email(),
  phone: z.string(),
  status: z.string(),
  timeZone: z.string(),
  country: z.string().nullable(),
  address: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  owner: z.object({
    name: z.string().nullable(),
    email: z.string().email(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
  }),
})

export const BusinessListResponseSchema = z.object({
  data: z.array(BusinessSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
})

export const BusinessDetailSchema = z.object({
  id: z.string(),
  companyName: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  website: z.string().nullable(),
  status: z.string(),
  registered: z.coerce.date(),
  timeZone: z.string(),
  country: z.string().nullable(),
  lastLogin: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  userId: z.string(),
  owner: z.object({
    name: z.string().nullable(),
    email: z.string().email(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
  }),
  totalJobs: z.number().int(),
  revenue: z.number(),
  users: z.number().int(),
  contactInfo: z.object({
    email: z.string().email(),
    phone: z.string(),
    address: z.string().nullable(),
    website: z.string().nullable(),
  }),
})

/** Browser/locale on signup; scheduling & phone requirements */
const BusinessTimeZoneSchema = z.preprocess(
  v => {
    if (v === undefined || v === null) {
      return undefined
    }
    if (typeof v !== 'string') {
      return undefined
    }
    const t = v.trim()
    return t === '' ? undefined : t
  },
  z
    .string()
    .refine(tz => isValidIanaTimeZoneId(tz), {
      message: 'Invalid IANA timezone (e.g. America/Edmonton, Europe/London)',
    })
    .optional()
)

const BusinessCountrySchema = z
  .union([
    z
      .string()
      .length(3, 'Country must be ISO 3166-1 alpha-2 (e.g. US, CA, GB)')
      .regex(/^[A-Za-z]{3}$/, 'Country must be 3-letter ISO code')
      .transform(s => s.toUpperCase()),
    z.literal(''),
  ])
  .optional()

export const CreateBusinessBodySchema = z
  .object({
    companyName: z.string().min(1, 'Company name is required'),
    email: z.string().email('Valid email is required'),
    phone: z.string().min(1, 'Phone number is required'),
    /** IANA zone; omit or null to infer from `country` (e.g. GB → Europe/London, US → America/New_York). */
    timeZone: BusinessTimeZoneSchema,
    /** ISO 3166-1 alpha-2; used when `timeZone` is missing (US has multiple zones—send `timeZone` for exact local time). */
    country: BusinessCountrySchema,
    address: z.string().optional(),
    website: z.string().url().optional().or(z.literal('')),
    tempPassword: z.string().min(1, 'Temporary password is required for owner login').optional(),
    status: z.boolean().optional().default(true),
  })
  .openapi({ description: 'Payload to create a new business (Kelly)' })

export const UpdateBusinessResponseSchema = z.object({
  id: z.string(),
  companyName: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  status: z.string(),
  timeZone: z.string(),
  country: z.string().nullable(),
})

export const UpdateBusinessBodySchema = z
  .object({
    companyName: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    website: z.string().url().optional().or(z.literal('')),
    status: z.boolean().optional(),
    timeZone: z.string().optional(),
    country: z.string().nullable().optional(),
  })
  .openapi({ description: 'Payload to update business information' })

export const UpdateCommissionBodySchema = z
  .object({
    commissionType: z.enum(['PERCENTAGE', 'FIXED', 'TIERED']).optional(),
    commissionValue: z.number().nullable().optional(),
  })
  .openapi({ description: 'Kelly: no Commission model - stub for API compatibility' })

export const BusinessParamsSchema = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
})

export const BusinessQuerySchema = z.object({
  search: z
    .string()
    .optional()
    .openapi({
      param: { name: 'search', in: 'query' },
      description: 'Search by name, email, or phone',
    }),
  status: z
    .enum(['Active', 'Inactive', 'Pending', 'Suspended'])
    .optional()
    .openapi({ param: { name: 'status', in: 'query' }, description: 'Filter by status' }),
  page: z
    .string()
    .optional()
    .openapi({ param: { name: 'page', in: 'query' } }),
  limit: z
    .string()
    .optional()
    .openapi({ param: { name: 'limit', in: 'query' } }),
})

/** Kelly: Clients mapped as list items */
export const BusinessClientSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string(),
  status: z.string(),
})

export const BusinessClientsResponseSchema = z.object({
  data: z.array(BusinessClientSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
})

/** Kelly: WorkOrders as jobs */
export const BusinessJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  assignee: z.string().nullable(),
  scheduledAt: z.string().nullable(),
  status: z.string(),
})

export const BusinessJobsResponseSchema = z.object({
  data: z.array(BusinessJobSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
})

/** Kelly: Clients with work order count */
export const BusinessClientWithJobsSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string(),
  workOrderCount: z.number().int(),
})

export const BusinessClientsWithJobsResponseSchema = z.object({
  data: z.array(BusinessClientWithJobsSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
})

export const ToggleStatusBodySchema = z
  .object({ status: z.boolean() })
  .openapi({ description: 'Payload to toggle business status' })

export const BUSINESS_ROUTES = {
  getBusinesses: createRoute({
    method: 'get',
    tags: [TAGS.business],
    path: '/',
    summary: 'Get all businesses',
    request: { query: BusinessQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(BusinessListResponseSchema), 'OK'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getBusiness: createRoute({
    method: 'get',
    tags: [TAGS.business],
    path: '/{id}',
    summary: 'Get business by ID',
    request: { params: BusinessParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(BusinessDetailSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  createBusiness: createRoute({
    method: 'post',
    tags: [TAGS.business],
    path: '/',
    summary: 'Create business',
    request: { body: jsonContentRequired(CreateBusinessBodySchema, 'Create business payload') },
    responses: {
      [HttpStatusCodes.CREATED]: jsonContent(
        zodResponseSchema(CreateBusinessResponseSchema),
        'Created'
      ),
      [HttpStatusCodes.CONFLICT]: jsonContent(zodResponseSchema(), 'Email already in use'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  updateBusiness: createRoute({
    method: 'patch',
    tags: [TAGS.business],
    path: '/{id}',
    summary: 'Update business',
    request: {
      params: BusinessParamsSchema,
      body: jsonContentRequired(UpdateBusinessBodySchema, 'Update payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(UpdateBusinessResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  updateBusinessCommission: createRoute({
    method: 'patch',
    tags: [TAGS.business],
    path: '/{id}/commission',
    summary: 'Update commission (Kelly: stub, no Commission model)',
    request: {
      params: BusinessParamsSchema,
      body: jsonContentRequired(UpdateCommissionBodySchema, 'Commission payload (stub)'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(
          z.object({ commissionType: z.string(), commissionValue: z.number().nullable() })
        ),
        'OK'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getBusinessClients: createRoute({
    method: 'get',
    tags: [TAGS.business],
    path: '/{id}/clients',
    summary: 'Get business clients (Kelly)',
    request: { params: BusinessParamsSchema, query: BusinessQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(BusinessClientsResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getBusinessJobs: createRoute({
    method: 'get',
    tags: [TAGS.business],
    path: '/{id}/jobs',
    summary: 'Get business work orders/jobs (Kelly)',
    request: { params: BusinessParamsSchema, query: BusinessQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(zodResponseSchema(BusinessJobsResponseSchema), 'OK'),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  getBusinessClientsWithJobs: createRoute({
    method: 'get',
    tags: [TAGS.business],
    path: '/{id}/clients-with-jobs',
    summary: 'Get business clients with work order count (Kelly)',
    request: { params: BusinessParamsSchema, query: BusinessQuerySchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(BusinessClientsWithJobsResponseSchema),
        'OK'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  toggleBusinessStatus: createRoute({
    method: 'patch',
    tags: [TAGS.business],
    path: '/{id}/status',
    summary: 'Toggle business status',
    request: {
      params: BusinessParamsSchema,
      body: jsonContentRequired(ToggleStatusBodySchema, 'Status payload'),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(z.object({ id: z.string(), status: z.string() })),
        'OK'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  suspendBusiness: createRoute({
    method: 'post',
    tags: [TAGS.business],
    path: '/{id}/suspend',
    summary: 'Suspend business',
    request: { params: BusinessParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(z.object({ id: z.string(), status: z.string() })),
        'OK'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  unsuspendBusiness: createRoute({
    method: 'post',
    tags: [TAGS.business],
    path: '/{id}/unsuspend',
    summary: 'Unsuspend business',
    request: { params: BusinessParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(z.object({ id: z.string(), status: z.string() })),
        'OK'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  sendEmail: createRoute({
    method: 'post',
    tags: [TAGS.business],
    path: '/{id}/send-email',
    summary: 'Send email to business',
    request: {
      params: BusinessParamsSchema,
      body: jsonContentRequired(
        z
          .object({
            subject: z.string().min(1),
            body: z.string().optional(),
            message: z.string().optional(),
          })
          .refine(d => (d.body ?? d.message ?? '').trim().length > 0, {
            message: 'body or message required',
            path: ['body'],
          }),
        'Email payload'
      ),
    },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(
          z.object({ success: z.boolean(), message: z.string(), email: z.string().email() })
        ),
        'OK'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.FORBIDDEN]: jsonContent(zodResponseSchema(), 'Forbidden'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),

  sendReminder: createRoute({
    method: 'post',
    tags: [TAGS.business],
    path: '/{id}/reminder',
    summary: 'Send reminder to business',
    request: { params: BusinessParamsSchema },
    responses: {
      [HttpStatusCodes.OK]: jsonContent(
        zodResponseSchema(
          z.object({ success: z.boolean(), message: z.string(), email: z.string().email() })
        ),
        'OK'
      ),
      [HttpStatusCodes.NOT_FOUND]: jsonContent(zodResponseSchema(), 'Not found'),
      [HttpStatusCodes.UNAUTHORIZED]: jsonContent(zodResponseSchema(), 'Unauthorized'),
      [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(zodResponseSchema(), 'Server error'),
    },
  }),
}

export type BusinessRoutes = typeof BUSINESS_ROUTES
